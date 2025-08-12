using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;


namespace KoodaamoJukebox.Database.Models
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

        public int? CurrentItemIndex { get; set; }

        public int? CurrentItemShuffleIndex { get; set; }

        public int? CurrentItemId { get; set; }

        public string? CurrentItemTrackId { get; set; }

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
            PlayingSince = queue.PlayingSince;

            CurrentItem = new CurrentItemDto
            {
                Index = queue.CurrentItemIndex,
                ShuffleIndex = queue.CurrentItemShuffleIndex,
                Id = queue.CurrentItemId,
                TrackId = queue.CurrentItemTrackId
            };
        }

        public string RoomCode { get; set; }
        public bool IsPaused { get; set; }
        public bool IsLooping { get; set; }
        public bool IsShuffled { get; set; }
        public CurrentItemDto CurrentItem { get; set; }
        public long? PlayingSince { get; set; }
    }

    public class CurrentItemDto
    {
        public int? Index { get; set; }
        public int? ShuffleIndex { get; set; }
        public int? Id { get; set; }
        public string? TrackId { get; set; }
    }
}