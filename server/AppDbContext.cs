using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;

namespace KoodaamoJukebox
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<HlsPlaylist> HlsPlaylists { get; set; }

        public DbSet<HlsSegment> HlsSegments { get; set; }

        public DbSet<AudioFile> AudioFiles { get; set; }

        public DbSet<Track> Tracks { get; set; }

        public DbSet<User> Users { get; set; }

        public DbSet<RoomInfo> RoomInfos { get; set; }

        public DbSet<QueueItem> QueueItems { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {


            modelBuilder.Entity<User>(entity =>
            {
                entity.ToTable("Users");
                entity.HasIndex(u => u.UserId).IsUnique();
                entity.Property(u => u.UserId).IsRequired();
                entity.Property(u => u.Username).IsRequired();
            });

            modelBuilder.Entity<RoomInfo>(entity =>
            {
                entity.ToTable("Queues");
                entity.HasIndex(q => q.InstanceId).IsUnique();
                entity.HasIndex(q => q.CurrentTrackIndex);
                entity.Property(q => q.InstanceId).IsRequired();
                entity.Property(q => q.isPaused).IsRequired();
                entity.Property(q => q.IsLooping).IsRequired();
            });

            modelBuilder.Entity<QueueItem>(entity =>
            {
                entity.ToTable("QueueItems");
                entity.HasIndex(qi => qi.TrackId);
                entity.HasIndex(qi => qi.Index);
                entity.Property(qi => qi.InstanceId).IsRequired();
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

            modelBuilder.Entity<AudioFile>(entity =>
            {
                entity.ToTable("AudioFiles");
                entity.HasKey(a => a.Id);
                entity.HasIndex(a => a.WebpageUrlHash).IsUnique();
                entity.Property(a => a.WebpageUrlHash).IsRequired();
                entity.Property(a => a.DownloadUrl).IsRequired();
            });
        }
        public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        {
            foreach (var entry in ChangeTracker.Entries<QueueItem>())
            {
                if (entry.State == EntityState.Added || entry.State == EntityState.Modified)
                {
                    var currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    entry.Entity.UpdatedAt = currentTime;
                    if (entry.State == EntityState.Added)
                    {
                        entry.Entity.CreatedAt = currentTime;
                    }
                }
            }

            return await base.SaveChangesAsync(cancellationToken);
        }
        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            var host = Environment.GetEnvironmentVariable("POSTGRES_HOST");
            var port = Environment.GetEnvironmentVariable("POSTGRES_PORT");
            var database = Environment.GetEnvironmentVariable("POSTGRES_DB");
            var username = Environment.GetEnvironmentVariable("POSTGRES_USER");
            var password = Environment.GetEnvironmentVariable("POSTGRES_PASSWORD");

            if (host == null || port == null || database == null || username == null || password == null)
            {
                throw new Exception("PostgreSQL environment variables not set");
            }

            optionsBuilder.UseNpgsql($"Host={host};Port={port};Database={database};Username={username};Password={password}");
        }
    }
}