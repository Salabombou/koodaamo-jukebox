using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace KoodaamoJukebox.Database
{
    public class KoodaamoJukeboxDbContext : DbContext
    {
        public KoodaamoJukeboxDbContext(DbContextOptions<KoodaamoJukeboxDbContext> options) : base(options) { }

        public DbSet<Track> Tracks { get; set; }

        public DbSet<User> Users { get; set; }

        public DbSet<RoomInfo> RoomInfos { get; set; }

        public DbSet<QueueItem> QueueItems { get; set; }

        public KoodaamoJukeboxDbContext() { }
        
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(entity =>
            {
                entity.ToTable("Users");
                entity.HasIndex(u => u.UserId).IsUnique();
                entity.Property(u => u.UserId).IsRequired();
                entity.Property(u => u.Username).IsRequired();
                entity.Property(u => u.IsEmbedded).IsRequired();
            });

            modelBuilder.Entity<RoomInfo>(entity =>
            {
                entity.ToTable("Queues");
                entity.HasIndex(q => q.RoomCode).IsUnique();
                entity.HasIndex(q => q.CurrentItemIndex);
                entity.HasIndex(q => q.CurrentItemTrackId);
                entity.Property(q => q.RoomCode).IsRequired();
                entity.Property(q => q.IsPaused).IsRequired();
                entity.Property(q => q.IsLooping).IsRequired();
            });

            modelBuilder.Entity<QueueItem>(entity =>
            {
                entity.ToTable("QueueItems");
                entity.HasIndex(qi => qi.WebpageUrlHash);
                entity.HasIndex(qi => qi.Index);
                entity.Property(qi => qi.RoomCode).IsRequired();
                entity.Property(qi => qi.WebpageUrlHash).IsRequired();
                entity.Property(qi => qi.Index).IsRequired();
                entity.Property(qi => qi.CreatedAt).IsRequired();
                entity.Property(qi => qi.UpdatedAt).IsRequired();
            });

            modelBuilder.Entity<Track>(entity =>
            {
                entity.ToTable("Tracks");
                entity.HasIndex(t => t.WebpageUrl).IsUnique();
                entity.Property(t => t.WebpageUrlHash).IsRequired();
                entity.Property(t => t.Type).IsRequired();
                entity.Property(t => t.WebpageUrl).IsRequired();
                entity.Property(t => t.Title).IsRequired();
            });
        }

        public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            var currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            foreach (var entry in ChangeTracker.Entries<QueueItem>())
            {
                if (entry.State == EntityState.Added)
                {
                    entry.Entity.CreatedAt = currentTime;
                }
                entry.Entity.UpdatedAt = currentTime;
            }
            foreach (var entry in ChangeTracker.Entries<User>())
            {
                if (entry.State == EntityState.Added)
                {
                    entry.Entity.CreatedAt = currentTime;
                }
                entry.Entity.UpdatedAt = currentTime;
            }

            return await base.SaveChangesAsync(cancellationToken);
        }
    }
}
