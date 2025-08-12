using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace KoodaamoJukebox.Database
{
    public class KoodaamoJukeboxDbContext : DbContext
    {
        public KoodaamoJukeboxDbContext(DbContextOptions<KoodaamoJukeboxDbContext> options) : base(options) { }

        public DbSet<HlsPlaylist> HlsPlaylists { get; set; }

        public DbSet<HlsSegment> HlsSegments { get; set; }

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
                entity.HasIndex(qi => qi.TrackId);
                entity.HasIndex(qi => qi.Index);
                entity.Property(qi => qi.RoomCode).IsRequired();
                entity.Property(qi => qi.TrackId).IsRequired();
                entity.Property(qi => qi.Index).IsRequired();
                entity.Property(qi => qi.CreatedAt).IsRequired();
                entity.Property(qi => qi.UpdatedAt).IsRequired();
            });

            modelBuilder.Entity<HlsPlaylist>(entity =>
            {
                entity.ToTable("HlsPlaylists");
                entity.HasKey(p => p.Id);
                entity.HasIndex(p => p.WebpageUrlHash).IsUnique();
                entity.Property(p => p.WebpageUrlHash).IsRequired();
                entity.Property(p => p.DownloadUrl).IsRequired();
                entity.Property(p => p.ExpiresAt).IsRequired();
            });

            modelBuilder.Entity<HlsSegment>(entity =>
            {
                entity.ToTable("HlsSegments");
                entity.HasKey(s => s.Id);
                entity.HasIndex(s => s.WebpageUrlHash);
                entity.HasIndex(s => s.DownloadUrlHash).IsUnique();
                entity.Property(s => s.WebpageUrlHash).IsRequired();
                entity.Property(s => s.DownloadUrl).IsRequired();
                entity.Property(s => s.DownloadUrlHash).IsRequired();
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
