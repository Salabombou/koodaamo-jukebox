using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Database.Models
{
    [Table("Users")]
    [Index(nameof(UserId), IsUnique = true)]
    [Index(nameof(AssociatedRoomCode))]
    [Index(nameof(ConnectionId))]
    public class User
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required long UserId { get; set; }
        [Required]
        public required bool IsEmbedded { get; set; }

        [Required]
        public required string Username { get; set; }

        public string? AssociatedRoomCode { get; set; }

        public string? ConnectionId { get; set; }

        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        public long UpdatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public class UserDto
    {
        public UserDto(User user)
        {
            UserId = user.UserId;
            Username = user.Username;
            AssociatedRoomCode = user.AssociatedRoomCode;
        }

        public long UserId { get; set; }
        public string Username { get; set; }
        public string? AssociatedRoomCode { get; set; }
    }
}
