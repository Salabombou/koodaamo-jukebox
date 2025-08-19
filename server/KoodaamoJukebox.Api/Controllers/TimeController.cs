using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System;

namespace KoodaamoJukebox.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Policy = "ClientOnly")]
    [Authorize(Policy = "ConnectedUserData")]
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
