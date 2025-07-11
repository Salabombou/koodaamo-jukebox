using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Database.Models
{
    [Table("HlsSegments")]
    [Index(nameof(WebpageUrlHash))]
    [Index(nameof(DownloadUrlHash), IsUnique = true)]
    public class HlsSegment
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string WebpageUrlHash { get; set; }

        [Required]
        public required string DownloadUrl { get; set; }

        [Required]
        public required string DownloadUrlHash { get; set; }

        public string? Path { get; set; }
    }
}
