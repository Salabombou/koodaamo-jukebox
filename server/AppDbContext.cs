using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;

namespace KoodaamoJukebox
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        public DbSet<Playlist> Playlists { get; set; }

        public DbSet<Segment> Segments { get; set; }

        public DbSet<Track> Tracks { get; set; }

        public DbSet<User> Users { get; set; }

        public DbSet<Queue> Queues { get; set; }

        public DbSet<QueueItem> QueueItems { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<Playlist>(entity =>
            {
                entity.HasIndex(p => p.TrackId).IsUnique();
                entity.Property(e => e.TrackId).IsRequired();
                entity.Property(e => e.Url).IsRequired();
                entity.Property(e => e.ExpiresAt).IsRequired();
                entity.Property(e => e.IsLive).IsRequired();
            });

            modelBuilder.Entity<Segment>(entity =>
            {
                entity.HasIndex(s => s.TrackId);
                entity.HasIndex(s => s.UrlHash);
                entity.Property(s => s.TrackId).IsRequired();
                entity.Property(s => s.UrlHash).IsRequired();
                entity.Property(s => s.Url).IsRequired();
            });

            modelBuilder.Entity<Track>(entity =>
            {
                entity.HasIndex(t => t.TrackId).IsUnique();
                entity.Property(t => t.TrackId).IsRequired();
                entity.Property(t => t.Title).IsRequired();
                entity.Property(t => t.Uploader).IsRequired();
                entity.Property(t => t.AlbumArt).IsRequired(false);
            });

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(u => u.UserId).IsUnique();
                entity.Property(u => u.UserId).IsRequired();
                entity.Property(u => u.Username).IsRequired();
            });

            modelBuilder.Entity<Queue>(entity =>
            {
                entity.HasIndex(q => q.InstanceId).IsUnique();
                entity.Property(q => q.InstanceId).IsRequired();
                entity.Property(q => q.isPaused).IsRequired();
                entity.Property(q => q.IsLooping).IsRequired();
                entity.Property(q => q.CurrentTrackIndex).IsRequired();
            });

            modelBuilder.Entity<QueueItem>(entity =>
            {
                entity.HasIndex(qi => qi.TrackId);
                entity.HasIndex(qi => qi.Index);
                entity.Property(qi => qi.InstanceId).IsRequired();
                entity.Property(qi => qi.TrackId).IsRequired();
                entity.Property(qi => qi.Index).IsRequired();
                entity.Property(qi => qi.CreatedAt).IsRequired();
                entity.Property(qi => qi.UpdatedAt).IsRequired();
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