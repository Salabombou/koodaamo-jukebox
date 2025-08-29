using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;


namespace KoodaamoJukebox.Database.Models
{
    [Table("QueueItems")]
    [Index(nameof(WebpageUrlHash))]
    public class QueueItem
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string RoomCode { get; set; }

        [Required]
        public required string WebpageUrlHash { get; set; }

        [Required]
        public required int Index { get; set; }

        public int? ShuffleIndex { get; set; }

        public bool IsDeleted { get; set; } = false;

        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public long UpdatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public class QueueItemDto
    {
        public QueueItemDto(QueueItem item)
        {
            Id = item.Id;
            TrackId = item.WebpageUrlHash;
            Index = item.Index;
            ShuffledIndex = item.ShuffleIndex;
            IsDeleted = item.IsDeleted;
        }

        public int Id { get; set; }
        public string TrackId { get; set; }
        public int Index { get; set; }
        public int? ShuffledIndex { get; set; }
        public bool IsDeleted { get; set; } = false;
    }
}
