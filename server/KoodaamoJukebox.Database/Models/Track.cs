using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Database.Models
{
    public enum TrackType
    {
        Unknown = 0,
        YouTube = 1,
    }

    [Table("Tracks")]
    [Index(nameof(WebpageUrl), IsUnique = true)]
    public class Track
    {
        [Key]
        public required string WebpageUrlHash { get; set; }

        [Required]
        public required TrackType Type { get; set; }

        [Required]
        public required string WebpageUrl { get; set; }

        [Required]
        public required string Title { get; set; }

        public string? Uploader { get; set; }

        public string? ThumbnailHigh { get; set; }

        public string? ThumbnailLow { get; set; }

        public string? Path { get; set; }
    }

    public class TrackDto
    {
        public TrackDto(Track track)
        {
            Id = track.WebpageUrlHash;
            WebpageUrl = track.WebpageUrl;
            Title = track.Title;
            Uploader = track.Uploader ?? "Unknown";
        }

        public string Id { get; set; }
        public string WebpageUrl { get; set; }
        public string Title { get; set; }
        public string Uploader { get; set; }
    }
}
