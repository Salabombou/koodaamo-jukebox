using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database;
using KoodaamoJukebox.Database.Models;
using System.Text.Json;
using System.Text;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using KoodaamoJukebox.Api.Hubs;


namespace KoodaamoJukebox.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;
        private readonly ILogger<AuthController> _logger;
        private readonly IHubContext<RoomHub> _hubContext;
        private readonly IConfiguration _configuration;

        private readonly string discordClientId;
        private readonly string discordClientSecret;
        private readonly string discordRedirectUri;
        private readonly SymmetricSecurityKey jwtSecretKey;

        public AuthController(KoodaamoJukeboxDbContext dbContext, ILogger<AuthController> logger, IHubContext<RoomHub> hubContext, IConfiguration configuration)
        {
            _dbContext = dbContext;
            _logger = logger;
            _hubContext = hubContext;
            _configuration = configuration;

            discordClientId = _configuration["Discord:ClientId"] ?? throw new InvalidOperationException("Discord:ClientId is not set in configuration");
            discordClientSecret = _configuration["Discord:ClientSecret"] ?? throw new InvalidOperationException("Discord:ClientSecret is not set in configuration");
            discordRedirectUri = _configuration["Discord:RedirectUri"] ?? throw new InvalidOperationException("Discord:RedirectUri is not set in configuration");

            var jwtSecret = _configuration["Jwt:Secret"] ?? throw new InvalidOperationException("Jwt:Secret is not set in configuration");
            jwtSecretKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        }

        private string GetAuthToken(long userId, string associatedRoomCode, int expiresIn, bool isEmbedded = false)
        {
            var creds = new SigningCredentials(jwtSecretKey, SecurityAlgorithms.HmacSha256);
            var claims = new List<Claim>
            {
                new("user_id", userId.ToString()),
                new("room_code", associatedRoomCode)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddSeconds(expiresIn),
                signingCredentials: creds,
                issuer: "server-KoodaamoJukebox"
            );
            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpPost]
        public async Task<ActionResult<AuthResponseDto>> DiscordAuth([FromBody] AuthRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.RoomCode) || string.IsNullOrWhiteSpace(dto.OAuth2Code))
            {
                return BadRequest("Room code and OAuth2 code are required");
            }

            try
            {
                using var client = new HttpClient();
                client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/x-www-form-urlencoded"));
                Dictionary<string, string> values;
                if (dto.IsEmbedded)
                {
                    values = new Dictionary<string, string>
                    {
                        { "client_id", discordClientId },
                        { "client_secret", discordClientSecret },
                        { "grant_type", "authorization_code" },
                        { "code", dto.OAuth2Code },
                    };
                }
                else
                {
                    if (!Regex.IsMatch(dto.RoomCode, @"^[0-9]{6}$"))
                    {
                        return BadRequest("Invalid room code format. It should be a 6-digit number.");
                    }
                    values = new Dictionary<string, string>
                    {
                        { "client_id", discordClientId },
                        { "client_secret", discordClientSecret },
                        { "grant_type", "authorization_code" },
                        { "code", dto.OAuth2Code },
                        { "redirect_uri", discordRedirectUri },
                    };
                }

                var content = new FormUrlEncodedContent(values);
                var response = await client.PostAsync("https://discord.com/api/oauth2/token", content);
                _logger.LogDebug("Discord OAuth response status: {StatusCode}", response.StatusCode);
                _logger.LogDebug("Discord OAuth response content: {Content}", await response.Content.ReadAsStringAsync());
                response.EnsureSuccessStatusCode();

                var data = await response.Content.ReadFromJsonAsync<JsonElement>();
                var accessToken = data.GetProperty("access_token").GetString();
                var refreshToken = data.GetProperty("refresh_token").GetString();
                var expiresIn = data.GetProperty("expires_in").GetInt32();

                if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(refreshToken) || expiresIn <= 0)
                {
                    return StatusCode(500, "Failed to get access token from Discord");
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                var userResponse = await client.GetAsync("https://discord.com/api/users/@me");
                userResponse.EnsureSuccessStatusCode();

                var user = await userResponse.Content.ReadFromJsonAsync<JsonElement>();

                string? userIdString = user.GetProperty("id").GetString();
                if (string.IsNullOrWhiteSpace(userIdString) || !long.TryParse(userIdString, out var userId))
                {
                    return StatusCode(500, "Failed to parse user id");
                }

                string? username = user.GetProperty("username").GetString();
                if (string.IsNullOrWhiteSpace(username))
                {
                    return StatusCode(500, "Failed to get user data");
                }

                var dbUser = await _dbContext.Users.FirstOrDefaultAsync(u => u.UserId == userId);
                if (dbUser == null)
                {
                    dbUser = new User
                    {
                        UserId = userId,
                        Username = username,
                        AssociatedRoomCode = dto.RoomCode,
                        IsEmbedded = dto.IsEmbedded,
                    };

                    _dbContext.Users.Add(dbUser);
                }

                // create queue for the roomCode if it doesn't exist
                var roomInfo = await _dbContext.RoomInfos.FirstOrDefaultAsync(q => q.RoomCode == dto.RoomCode);
                if (roomInfo == null)
                {
                    roomInfo = new RoomInfo
                    {
                        RoomCode = dto.RoomCode,
                        IsEmbedded = dto.IsEmbedded,
                    };
                    _dbContext.RoomInfos.Add(roomInfo);
                }

                if (roomInfo.IsEmbedded != dto.IsEmbedded)
                {
                    return BadRequest("Room code does not match the embedded status");
                }

                dbUser.IsEmbedded = dto.IsEmbedded;
                dbUser.Username = username;
                dbUser.AssociatedRoomCode = roomInfo.RoomCode;

                if (dbUser.ConnectionId != null)
                {
                    // remove user from the previous room
                    await _hubContext.Groups.RemoveFromGroupAsync(dbUser.ConnectionId, dbUser.AssociatedRoomCode);
                    dbUser.ConnectionId = null;
                }

                if (_dbContext.Entry(dbUser).State != EntityState.Added)
                {
                    _dbContext.Users.Update(dbUser);
                }
                await _dbContext.SaveChangesAsync();

                return Ok(new AuthResponseDto
                {
                    AuthToken = GetAuthToken(dbUser.UserId, dbUser.AssociatedRoomCode, expiresIn),
                    AccessToken = accessToken,
                    RefreshToken = refreshToken,
                    ExpiresIn = expiresIn
                });
            }
            catch (Exception e)
            {
                return StatusCode(500, e.Message);
            }
        }

        [HttpPost("refresh")]
        public async Task<ActionResult<AuthResponseDto>> Refresh([FromBody] RefreshRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.RoomCode) || string.IsNullOrWhiteSpace(dto.RefreshToken))
            {
                return BadRequest("Room code and refresh token are required");
            }

            try
            {
                using var client = new HttpClient();
                var values = new Dictionary<string, string>
                {
                    { "client_id", discordClientId },
                    { "client_secret", discordClientSecret },
                    { "grant_type", "refresh_token" },
                    { "refresh_token", dto.RefreshToken },
                };
                var content = new FormUrlEncodedContent(values);
                var response = await client.PostAsync("https://discord.com/api/oauth2/token", content);
                _logger.LogDebug("Discord refresh response status: {StatusCode}", response.StatusCode);
                _logger.LogDebug("Discord refresh response content: {Content}", await response.Content.ReadAsStringAsync());
                response.EnsureSuccessStatusCode();

                var data = await response.Content.ReadFromJsonAsync<JsonElement>();
                var accessToken = data.GetProperty("access_token").GetString();
                var refreshToken = data.GetProperty("refresh_token").GetString();
                var expiresIn = data.GetProperty("expires_in").GetInt32();

                if (string.IsNullOrWhiteSpace(accessToken) || string.IsNullOrWhiteSpace(refreshToken) || expiresIn <= 0)
                {
                    return StatusCode(500, "Failed to refresh access token from Discord");
                }

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                var userResponse = await client.GetAsync("https://discord.com/api/users/@me");
                userResponse.EnsureSuccessStatusCode();

                var user = await userResponse.Content.ReadFromJsonAsync<JsonElement>();

                string? userIdString = user.GetProperty("id").GetString();
                if (string.IsNullOrWhiteSpace(userIdString) || !long.TryParse(userIdString, out var userId))
                {
                    return StatusCode(500, "Failed to parse user id");
                }

                string? username = user.GetProperty("username").GetString();
                if (string.IsNullOrWhiteSpace(username))
                {
                    return StatusCode(500, "Failed to get user data");
                }

                var dbUser = await _dbContext.Users.FirstOrDefaultAsync(u => u.UserId == userId);
                if (dbUser == null)
                {
                    return StatusCode(404, "User not found");
                }

                var roomInfo = await _dbContext.RoomInfos.FirstOrDefaultAsync(r => r.RoomCode == dto.RoomCode);
                if (roomInfo == null)
                {
                    if (!dto.IsEmbedded && !Regex.IsMatch(dto.RoomCode, @"^[0-9]{6}$"))
                    {
                        return BadRequest("Invalid room code format. It should be a 6-digit number.");
                    }
                    roomInfo = new RoomInfo
                    {
                        RoomCode = dto.RoomCode,
                        IsEmbedded = dto.IsEmbedded,
                    };
                    _dbContext.RoomInfos.Add(roomInfo);
                }

                if (roomInfo.IsEmbedded != dto.IsEmbedded)
                {
                    return BadRequest("Room code does not match the embedded status");
                }

                dbUser.IsEmbedded = dto.IsEmbedded;
                dbUser.Username = username;
                dbUser.AssociatedRoomCode = roomInfo.RoomCode;

                if (dbUser.ConnectionId != null)
                {
                    // remove user from the previous room
                    await _hubContext.Groups.RemoveFromGroupAsync(dbUser.ConnectionId, dbUser.AssociatedRoomCode);
                    dbUser.ConnectionId = null;
                }

                _dbContext.Users.Update(dbUser);
                await _dbContext.SaveChangesAsync();

                return Ok(new AuthResponseDto
                {
                    AuthToken = GetAuthToken(dbUser.UserId, dbUser.AssociatedRoomCode, expiresIn),
                    AccessToken = accessToken,
                    RefreshToken = refreshToken,
                    ExpiresIn = expiresIn
                });
            }
            catch (Exception e)
            {
                return StatusCode(500, e.Message);
            }
        }
    }

    public class AuthRequestDto
    {
        public required string OAuth2Code { get; set; }
        public required string RoomCode { get; set; }
        public required bool IsEmbedded { get; set; }
    }

    public class AuthResponseDto
    {
        public required string AuthToken { get; set; }
        public required string AccessToken { get; set; }
        public required string RefreshToken { get; set; }
        public required int ExpiresIn { get; set; }
    }

    public class RefreshRequestDto
    {
        public required string RefreshToken { get; set; }
        public required string RoomCode { get; set; }
        public required bool IsEmbedded { get; set; }
    }
}
