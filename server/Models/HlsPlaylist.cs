using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Models
{
    [Table("Playlists")]
    [Index(nameof(TrackId), IsUnique = true)]
    public class HlsPlaylist
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string TrackId { get; set; }

        [Required]
        public required string Url { get; set; }

        public string? Path { get; set; }

        public float? Duration { get; set; }

        [Required]
        public required long ExpiresAt { get; set; }

        [Required]
        public required bool IsLive { get; set; }
    }
}
