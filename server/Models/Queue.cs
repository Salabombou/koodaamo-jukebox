using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;


namespace KoodaamoJukebox.Models
{
    [Table("Queues")]
    [Index(nameof(InstanceId), IsUnique = true)]
    public class Queue
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required string InstanceId { get; set; }

        public bool isPaused { get; set; } = true;

        public bool IsLooping { get; set; } = false;

        public int? ShuffleSeed { get; set; }

        public int CurrentTrackIndex { get; set; } = 0;

        public long? PlayingSince { get; set; }
    }

    public class QueueDto
    {
        public QueueDto(Queue queue)
        {
            InstanceId = queue.InstanceId;
            IsPaused = queue.isPaused;
            IsLooping = queue.IsLooping;
            ShuffleSeed = queue.ShuffleSeed;
            CurrentTrackIndex = queue.CurrentTrackIndex;
            PlayingSince = queue.PlayingSince;
        }
        
        public string InstanceId { get; set; }
        public bool IsPaused { get; set; } = true;
        public bool IsLooping { get; set; } = false;
        public int? ShuffleSeed { get; set; }
        public int CurrentTrackIndex { get; set; }
        public long? PlayingSince { get; set; }
    }
}