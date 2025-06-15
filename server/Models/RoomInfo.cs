using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;


namespace KoodaamoJukebox.Models
{
    [Table("Queues")]
    [Index(nameof(RoomCode), IsUnique = true)]
    public class RoomInfo
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string RoomCode { get; set; }

        [Required]
        public required bool IsEmbedded { get; set; }

        public bool IsPaused { get; set; } = true;

        public bool IsLooping { get; set; } = false;

        public bool IsShuffled { get; set; } = false;

        public int? CurrentTrackIndex { get; set; }

        public long? PlayingSince { get; set; }
        
        public long? PausedAt { get; set; }
    }

    public class RoomInfoDto
    {
        public RoomInfoDto(RoomInfo queue)
        {
            RoomCode = queue.RoomCode;
            IsPaused = queue.IsPaused;
            IsLooping = queue.IsLooping;
            IsShuffled = queue.IsShuffled;
            CurrentTrackIndex = queue.CurrentTrackIndex;
            PlayingSince = queue.PlayingSince;
        }
        
        public string RoomCode { get; set; }
        public bool IsPaused { get; set; }
        public bool IsLooping { get; set; }
        public bool IsShuffled { get; set; }
        public int? CurrentTrackIndex { get; set; }
        public long? PlayingSince { get; set; }
    }
}