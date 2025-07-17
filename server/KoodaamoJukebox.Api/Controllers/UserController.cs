using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using KoodaamoJukebox.Database;
using Microsoft.AspNetCore.Authorization;

namespace KoodaamoJukebox.Api.Controllers
{
    [ApiController]
    [Authorize(Policy = "BotOnly")]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;

        public UserController(KoodaamoJukeboxDbContext dbContext)
        {
            _dbContext = dbContext;
        }

        [HttpGet("{userId}")]
        public async Task<ActionResult<UserDto>> GetUser(long userId)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null)
            {
                return NotFound();
            }
            return Ok(new UserDto(user));
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<UserDto>>> GetAllUsers()
        {
            var users = await _dbContext.Users
                .Select(u => new UserDto(u))
                .ToListAsync();
            return Ok(users);
        }

        [HttpPost("{userId}/ban")]
        public async Task<IActionResult> BanUser(long userId, [FromBody] UserBanDto banDto)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null)
            {
                return NotFound();
            }

            user.BannedUntil = banDto.Until;
            user.BannedReason = banDto.Reason;
            await _dbContext.SaveChangesAsync();

            return NoContent();
        }

        [HttpPost("{userId}/unban")]
        public async Task<IActionResult> UnbanUser(long userId)
        {
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.UserId == userId);
            if (user == null)
            {
                return NotFound();
            }

            user.BannedUntil = null;
            user.BannedReason = null;
            await _dbContext.SaveChangesAsync();

            return NoContent();
        }
    }

    public class UserBanDto
    {
        public required string Reason { get; set; }
        public required long Until { get; set; }
    }
}
