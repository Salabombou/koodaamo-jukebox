using KoodaamoJukebox.Api.Services;
using KoodaamoJukebox.Database;
using KoodaamoJukebox.Database.Models;
using KoodaamoJukebox.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace KoodaamoJukebox.Api.Tests
{
    public class QueueServiceTests : IDisposable
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;
        private readonly Mock<IHubContext<RoomHub>> _hubContextMock;
        private readonly Mock<IConfiguration> _configurationMock;
        private readonly QueueService _queueService;
        private readonly string _roomCode = "test-room";

        public QueueServiceTests()
        {
            // Setup in-memory database
            var options = new DbContextOptionsBuilder<KoodaamoJukeboxDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
            _dbContext = new KoodaamoJukeboxDbContext(options);

            // Setup mocks
            _hubContextMock = new Mock<IHubContext<RoomHub>>();
            var clientsMock = new Mock<IHubClients>();
            var groupMock = new Mock<IClientProxy>();
            clientsMock.Setup(c => c.Group(It.IsAny<string>())).Returns(groupMock.Object);
            _hubContextMock.Setup(h => h.Clients).Returns(clientsMock.Object);

            _configurationMock = new Mock<IConfiguration>();

            // Mock configuration for YtDlp
            _configurationMock.Setup(c => c["YtDlp:Path"]).Returns("yt-dlp");
            _configurationMock.Setup(c => c["YouTube:ApiKey"]).Returns("test-api-key");

            _queueService = new QueueService(_dbContext, _hubContextMock.Object, _configurationMock.Object);

            // Setup initial data
            SetupInitialData().Wait();
        }

        private async Task SetupInitialData()
        {
            // Create room
            var roomInfo = new RoomInfo
            {
                RoomCode = _roomCode,
                IsEmbedded = false,
                IsPaused = true,
                IsLooping = false,
                IsShuffled = false,
                CurrentItemIndex = 0,
                CurrentItemShuffleIndex = null,
                CurrentItemId = 1,
                CurrentItemTrackId = "track1-hash",
                PlayingSince = null,
                PausedAt = null
            };
            await _dbContext.RoomInfos.AddAsync(roomInfo);

            // Create 5 mock tracks
            var tracks = new List<Track>
            {
                new Track { WebpageUrlHash = "track1-hash", Type = TrackType.YouTube, WebpageUrl = "https://youtube.com/watch?v=1", Title = "Track 1", Uploader = "Artist 1" },
                new Track { WebpageUrlHash = "track2-hash", Type = TrackType.YouTube, WebpageUrl = "https://youtube.com/watch?v=2", Title = "Track 2", Uploader = "Artist 2" },
                new Track { WebpageUrlHash = "track3-hash", Type = TrackType.YouTube, WebpageUrl = "https://youtube.com/watch?v=3", Title = "Track 3", Uploader = "Artist 3" },
                new Track { WebpageUrlHash = "track4-hash", Type = TrackType.YouTube, WebpageUrl = "https://youtube.com/watch?v=4", Title = "Track 4", Uploader = "Artist 4" },
                new Track { WebpageUrlHash = "track5-hash", Type = TrackType.YouTube, WebpageUrl = "https://youtube.com/watch?v=5", Title = "Track 5", Uploader = "Artist 5" }
            };
            await _dbContext.Tracks.AddRangeAsync(tracks);

            // Create 5 queue items
            var queueItems = new List<QueueItem>
            {
                new QueueItem { Id = 1, RoomCode = _roomCode, WebpageUrlHash = "track1-hash", Index = 0, ShuffleIndex = null, IsDeleted = false },
                new QueueItem { Id = 2, RoomCode = _roomCode, WebpageUrlHash = "track2-hash", Index = 1, ShuffleIndex = null, IsDeleted = false },
                new QueueItem { Id = 3, RoomCode = _roomCode, WebpageUrlHash = "track3-hash", Index = 2, ShuffleIndex = null, IsDeleted = false },
                new QueueItem { Id = 4, RoomCode = _roomCode, WebpageUrlHash = "track4-hash", Index = 3, ShuffleIndex = null, IsDeleted = false },
                new QueueItem { Id = 5, RoomCode = _roomCode, WebpageUrlHash = "track5-hash", Index = 4, ShuffleIndex = null, IsDeleted = false }
            };
            await _dbContext.QueueItems.AddRangeAsync(queueItems);

            await _dbContext.SaveChangesAsync();
        }

        public void Dispose()
        {
            _dbContext.Dispose();
        }

        [Fact]
        public async Task Pause_ShouldTogglePauseState()
        {
            // Arrange
            var roomInfo = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            roomInfo.IsPaused = false;
            roomInfo.PlayingSince = 1000;
            await _dbContext.SaveChangesAsync();

            // Act
            await _queueService.Pause(_roomCode, true);

            // Assert
            var updatedRoom = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            Assert.True(updatedRoom.IsPaused);
            Assert.Equal(1000, updatedRoom.PlayingSince); // PlayingSince should remain the same since current item is set
            Assert.NotNull(updatedRoom.PausedAt);
        }

        [Fact]
        public async Task Seek_ShouldUpdatePlayingSince()
        {
            // Arrange
            var roomInfo = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            roomInfo.PlayingSince = 1000;
            await _dbContext.SaveChangesAsync();

            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            // Act
            await _queueService.Seek(_roomCode, 30);

            // Assert
            var updatedRoom = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            long expectedPlayingSince = 1000 + (currentTime - 1000) - 30 * 1000;
            Assert.Equal(expectedPlayingSince, updatedRoom.PlayingSince);
        }

        [Fact]
        public async Task Loop_ShouldToggleLoopState()
        {
            // Act
            await _queueService.Loop(_roomCode, true);

            // Assert
            var updatedRoom = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            Assert.True(updatedRoom.IsLooping);
        }

        [Fact]
        public async Task Skip_ShouldUpdateCurrentItem()
        {
            // Act
            await _queueService.Skip(_roomCode, 2);

            // Assert
            var updatedRoom = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            Assert.Equal(2, updatedRoom.CurrentItemIndex);
            Assert.Equal("track3-hash", updatedRoom.CurrentItemTrackId);
            Assert.Null(updatedRoom.PlayingSince);
            Assert.Null(updatedRoom.PausedAt);
        }

        [Fact]
        public async Task Move_ShouldReorderQueueItems()
        {
            // Act
            await _queueService.Move(_roomCode, 0, 2);

            // Assert
            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == _roomCode && !qi.IsDeleted)
                .OrderBy(qi => qi.Index)
                .ToListAsync();

            Assert.Equal("track2-hash", queueItems[0].WebpageUrlHash);
            Assert.Equal("track3-hash", queueItems[1].WebpageUrlHash);
            Assert.Equal("track1-hash", queueItems[2].WebpageUrlHash);
        }

        [Fact]
        public async Task Shuffle_ShouldShuffleQueueItems()
        {
            // Act
            await _queueService.Shuffle(_roomCode, true);

            // Assert
            var updatedRoom = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            Assert.True(updatedRoom.IsShuffled);

            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == _roomCode && !qi.IsDeleted)
                .ToListAsync();

            // Check that shuffle indices are set
            Assert.All(queueItems, qi => Assert.NotNull(qi.ShuffleIndex));
        }

        [Fact]
        public async Task Clear_ShouldMarkAllItemsAsDeletedExceptCurrent()
        {
            // Act
            await _queueService.Clear(_roomCode);

            // Assert
            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == _roomCode)
                .ToListAsync();

            var deletedItems = queueItems.Where(qi => qi.Id != 1).ToList();
            Assert.All(deletedItems, qi => Assert.True(qi.IsDeleted));

            var currentItem = queueItems.First(qi => qi.Id == 1);
            Assert.False(currentItem.IsDeleted);
            Assert.Equal(0, currentItem.Index);
        }

        [Fact]
        public async Task Delete_ShouldMarkItemAsDeletedAndUpdateIndices()
        {
            // Act
            await _queueService.Delete(_roomCode, 2);

            // Assert
            var deletedItem = await _dbContext.QueueItems.FirstAsync(qi => qi.Id == 2);
            Assert.True(deletedItem.IsDeleted);

            var remainingItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == _roomCode && !qi.IsDeleted)
                .OrderBy(qi => qi.Index)
                .ToListAsync();

            Assert.Equal(4, remainingItems.Count);
            Assert.Equal("track1-hash", remainingItems[0].WebpageUrlHash);
            Assert.Equal("track3-hash", remainingItems[1].WebpageUrlHash);
        }

        [Fact]
        public async Task ComplexOperations_ShouldMaintainConsistency()
        {
            // Perform a series of operations
            await _queueService.Skip(_roomCode, 1);
            await _queueService.Pause(_roomCode, true);
            await _queueService.Move(_roomCode, 2, 0);
            await _queueService.Shuffle(_roomCode, true);
            await _queueService.Loop(_roomCode, true);
            await _queueService.Seek(_roomCode, 10);
            await _queueService.Delete(_roomCode, 3);

            // Assert final state consistency
            var roomInfo = await _dbContext.RoomInfos.FirstAsync(r => r.RoomCode == _roomCode);
            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == _roomCode && !qi.IsDeleted)
                .ToListAsync();

            // Current item should exist and be valid
            Assert.NotNull(roomInfo.CurrentItemId);
            Assert.NotNull(roomInfo.CurrentItemTrackId);
            Assert.Contains(queueItems, qi => qi.Id == roomInfo.CurrentItemId);

            // Indices should be consistent
            if (roomInfo.IsShuffled)
            {
                Assert.NotNull(roomInfo.CurrentItemShuffleIndex);
                Assert.Contains(queueItems, qi => qi.ShuffleIndex == roomInfo.CurrentItemShuffleIndex);
            }
            else
            {
                Assert.NotNull(roomInfo.CurrentItemIndex);
                Assert.Contains(queueItems, qi => qi.Index == roomInfo.CurrentItemIndex);
            }

            // All non-deleted items should have valid indices
            Assert.All(queueItems, qi => Assert.False(qi.IsDeleted));
        }
    }
}
