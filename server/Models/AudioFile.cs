using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Models
{
    [Table("AudioFiles")]
    [Index(nameof(WebpageUrlHash), IsUnique = true)]
    public class AudioFile
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string WebpageUrlHash { get; set; }

        [Required]
        public required string DownloadUrl { get; set; }

        public string? Path { get; set; }
    }
}