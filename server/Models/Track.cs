using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Models
{
    [Table("Tracks")]
    [Index(nameof(TrackId), IsUnique = true)]
    public class Track
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string TrackId { get; set; }

        [Required]
        public required string Title { get; set; }

        [Required]
        public required string Uploader { get; set; }

        [Required]
        public string? AlbumArt { get; set; }
    }

    public class TrackDto
    {
        public TrackDto(Track track)
        {
            TrackId = track.TrackId;
            Title = track.Title;
            Uploader = track.Uploader;
        }
        
        public string TrackId { get; set; }
        public string Title { get; set; }
        public string Uploader { get; set; }
    }
}
