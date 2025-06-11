using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Utilities;

namespace KoodaamoJukebox.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/[controller]")]
    [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any, NoStore = false)]
    public class TrackController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly ILogger<TrackController> _logger;

        public TrackController(AppDbContext dbContext, ILogger<TrackController> logger)
        {
            _dbContext = dbContext;
            _logger = logger;
        }


        [HttpPost]
        public async Task<ActionResult<TrackDto[]>> GetTracks([FromBody] TracksRequestDto dto)
        {
            if (dto == null || dto.WebpageUrlHashes == null || dto.WebpageUrlHashes.Count == 0)
            {
                return BadRequest("TrackIds cannot be null or empty.");
            }

            var tracks = await _dbContext.Tracks
                .Where(t => dto.WebpageUrlHashes.Contains(t.WebpageUrlHash))
                .ToListAsync();

            if (tracks.Count == 0)
            {
                return NotFound("No tracks found for the provided TrackIds.");
            }

            var trackDtos = tracks.Select(t => new TrackDto(t)).ToArray();
            return Ok(trackDtos);
        }


        [HttpGet("{webpageUrlHash}")]
        public async Task<ActionResult<TrackDto>> GetTrack(string webpageUrlHash)
        {
            var track = await _dbContext.Tracks.FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null)
            {
                return NotFound();
            }

            return Ok(new TrackDto(track));
        }

        [HttpGet("{webpageUrlHash}/thumbnail-high")]
        [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any, NoStore = false)]
        [AllowAnonymous]
        public async Task<ActionResult> GetTrackThumbnail(string webpageUrlHash)
        {
            var track = await _dbContext.Tracks.FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null)
            {
                return NotFound();
            }

            if (!string.IsNullOrEmpty(track.ThumbnailHigh))
            {
                return Redirect(track.ThumbnailHigh);
            }
            else if (!string.IsNullOrEmpty(track.ThumbnailLow))
            {
                return Redirect(track.ThumbnailLow);
            }
            else
            {
                return NotFound("No thumbnail available for this track.");
            }
        }

        [HttpGet("{webpageUrlHash}/thumbnail-low")]
        [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any, NoStore = false)]
        [AllowAnonymous]
        public async Task<ActionResult> GetTrackThumbnailLow(string webpageUrlHash)
        {
            var track = await _dbContext.Tracks.FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null)
            {
                return NotFound();
            }

            if (!string.IsNullOrEmpty(track.ThumbnailLow))
            {
                return Redirect(track.ThumbnailLow);
            }
            else if (!string.IsNullOrEmpty(track.ThumbnailHigh))
            {
                return Redirect(track.ThumbnailHigh);
            }
            else
            {
                return NotFound("No thumbnail available for this track.");
            }
        }
    }

    public class TracksRequestDto
    {
        public HashSet<string> WebpageUrlHashes { get; set; } = null!;
    }
}