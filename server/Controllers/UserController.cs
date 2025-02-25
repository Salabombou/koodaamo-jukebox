using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using Microsoft.AspNetCore.Authorization;

namespace KoodaamoJukebox.Controllers
{
    [ApiController]
    [Authorize(Roles = "Bot")]
    [Route("api/[controller]")]
    public class UserController : ControllerBase
    {
        private readonly AppDbContext _dbContext;

        public UserController(AppDbContext dbContext)
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
    }
}
