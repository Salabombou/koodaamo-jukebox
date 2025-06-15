using Microsoft.AspNetCore.Mvc;
using System;

namespace server.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TimeController : ControllerBase
    {
        [HttpGet]
        public IActionResult GetUnixTimestamp()
        {
            // Return current Unix timestamp in milliseconds
            var unixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return Ok(new { unixTimestamp });
        }
    }
}
