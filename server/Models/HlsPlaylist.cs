using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Models
{
    [Table("HlsPlaylists")]
    [Index(nameof(WebpageUrlHash), IsUnique = true)]
    public class HlsPlaylist
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string WebpageUrlHash { get; set; }

        [Required]
        public required string DownloadUrl { get; set; }

        [Required]
        public required long ExpiresAt { get; set; }

        public string? Path { get; set; }
    }
}
