using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Models
{
    [Table("Users")]
    [Index(nameof(UserId), IsUnique = true)]
    [Index(nameof(AssociatedInstanceId))]
    [Index(nameof(ConnectionId))]
    public class User
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public required long UserId { get; set; }

        [Required]
        public required string Username { get; set; }

        public string? AssociatedInstanceId { get; set; }

        public string? ConnectionId { get; set; }
    }

    public class UserDto
    {
        public UserDto(User user)
        {
            UserId = user.UserId;
            Username = user.Username;
            AssociatedInstanceId = user.AssociatedInstanceId;
        }

        public long UserId { get; set; }
        public string Username { get; set; }
        public string? AssociatedInstanceId { get; set; }
    }
}
