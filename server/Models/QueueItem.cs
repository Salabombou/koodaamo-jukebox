using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;


namespace KoodaamoJukebox.Models
{
    [Table("QueueItems")]
    [Index(nameof(TrackId))]
    public class QueueItem
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string InstanceId { get; set; }

        [Required]
        public required string TrackId { get; set; }

        [Required]
        public required int Index { get; set; }

        public bool IsDeleted { get; set; } = false;

        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public long UpdatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public class QueueItemDto
    {
        public QueueItemDto(QueueItem item)
        {
            Id = item.Id;
            TrackId = item.TrackId;
            Index = item.Index;
            IsDeleted = item.IsDeleted;
        }

        public int Id { get; set; }
        public string TrackId { get; set; }
        public int Index { get; set; }
        public bool IsDeleted { get; set; } = false;
    }
}
