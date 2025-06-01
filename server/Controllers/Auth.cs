using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using System.Text.Json;
using System.Text;
using System.Net.Http.Headers;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;


namespace KoodaamoJukebox.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly ILogger<AuthController> _logger;

        private readonly string discordClientId;
        private readonly string discordClientSecret;
        private readonly SymmetricSecurityKey jwtSecretKey;

        public AuthController(AppDbContext dbContext, ILogger<AuthController> logger)
        {
            _dbContext = dbContext;
            _logger = logger;

            discordClientId = Environment.GetEnvironmentVariable("DISCORD_CLIENT_ID") ?? throw new InvalidOperationException("DISCORD_CLIENT_ID is not set");
            discordClientSecret = Environment.GetEnvironmentVariable("DISCORD_CLIENT_SECRET") ?? throw new InvalidOperationException("DISCORD_CLIENT_SECRET is not set");

            var jwtSecret = Environment.GetEnvironmentVariable("JWT_SECRET") ?? throw new InvalidOperationException("JWT_SECRET is not set");
            jwtSecretKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        }

        private string GetAuthToken(long userId, string associatedInstanceId)
        {
            var creds = new SigningCredentials(jwtSecretKey, SecurityAlgorithms.HmacSha256);
            var claims = new List<Claim>
            {
                new Claim("user_id", userId.ToString()),
                new Claim("instance_id", associatedInstanceId),
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddDays(7),
                signingCredentials: creds,
                issuer: "jukebox-server"
            );
            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpPost]
        public async Task<ActionResult<AuthResponseDto>> DiscordAuth([FromBody] AuthRequestDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Code))
            {
                return BadRequest();
            }

            try
            {
                using var client = new HttpClient();
                var values = new Dictionary<string, string>
                {
                    { "client_id", discordClientId },
                    { "client_secret", discordClientSecret },
                    { "grant_type", "authorization_code" },
                    { "code", dto.Code },
                };
                var content = new FormUrlEncodedContent(values);
                var response = await client.PostAsync("https://discord.com/api/oauth2/token", content);
                response.EnsureSuccessStatusCode();

                var data = await response.Content.ReadFromJsonAsync<JsonElement>();
                var accessToken = data.GetProperty("access_token").GetString();

                if (string.IsNullOrWhiteSpace(accessToken))
                {
                    return StatusCode(500, "Failed to get access token");
                }


                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
                var userResponse = await client.GetAsync("https://discord.com/api/users/@me");
                userResponse.EnsureSuccessStatusCode();

                var user = await userResponse.Content.ReadFromJsonAsync<JsonElement>();
                var userIdString = user.GetProperty("id").GetString();
                if (string.IsNullOrWhiteSpace(userIdString) || !long.TryParse(userIdString, out var userId))
                {
                    return StatusCode(500, "Failed to parse user id");
                }
                var username = user.GetProperty("username").GetString();

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
                        AssociatedInstanceId = dto.InstanceId,
                    };

                    _dbContext.Users.Add(dbUser);
                }
                else
                {
                    dbUser.Username = username;
                    dbUser.AssociatedInstanceId = dto.InstanceId;
                }

                await _dbContext.SaveChangesAsync();

                // create queue for the instanceId if it doesn't exist
                var queue = await _dbContext.Queues.FirstOrDefaultAsync(q => q.InstanceId == dto.InstanceId);
                if (queue == null)
                {
                    queue = new Queue
                    {
                        InstanceId = dto.InstanceId
                    };
                    _dbContext.Queues.Add(queue);
                    await _dbContext.SaveChangesAsync();
                }

                return Ok(new AuthResponseDto
                {
                    AuthToken = GetAuthToken(dbUser.UserId, dbUser.AssociatedInstanceId),
                    AccessToken = accessToken
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
        public required string Code { get; set; }
        public required string InstanceId { get; set; }
    }

    public class AuthResponseDto
    {
        public required string AuthToken { get; set; }
        public required string AccessToken { get; set; }
    }
}