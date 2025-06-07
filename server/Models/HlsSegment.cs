using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Models
{
    [Table("Segments")]
    [Index(nameof(TrackId))]
    [Index(nameof(UrlHash), IsUnique = true)]
    public class Segment
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string TrackId { get; set; }

        [Required]
        public required string Url { get; set; }

        [Required]
        public required string UrlHash { get; set; }

        public string? Path { get; set; }
    }
}
