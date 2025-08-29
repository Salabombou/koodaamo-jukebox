using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace KoodaamoJukebox.Database.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QueueItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoomCode = table.Column<string>(type: "text", nullable: false),
                    WebpageUrlHash = table.Column<string>(type: "text", nullable: false),
                    Index = table.Column<int>(type: "integer", nullable: false),
                    ShuffleIndex = table.Column<int>(type: "integer", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAt = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QueueItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Queues",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    RoomCode = table.Column<string>(type: "text", nullable: false),
                    IsEmbedded = table.Column<bool>(type: "boolean", nullable: false),
                    IsPaused = table.Column<bool>(type: "boolean", nullable: false),
                    IsLooping = table.Column<bool>(type: "boolean", nullable: false),
                    IsShuffled = table.Column<bool>(type: "boolean", nullable: false),
                    CurrentItemIndex = table.Column<int>(type: "integer", nullable: true),
                    CurrentItemShuffleIndex = table.Column<int>(type: "integer", nullable: true),
                    CurrentItemId = table.Column<int>(type: "integer", nullable: true),
                    CurrentItemTrackId = table.Column<string>(type: "text", nullable: true),
                    PlayingSince = table.Column<long>(type: "bigint", nullable: true),
                    PausedAt = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Queues", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tracks",
                columns: table => new
                {
                    WebpageUrlHash = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    WebpageUrl = table.Column<string>(type: "text", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Uploader = table.Column<string>(type: "text", nullable: true),
                    ThumbnailHigh = table.Column<string>(type: "text", nullable: true),
                    ThumbnailLow = table.Column<string>(type: "text", nullable: true),
                    Path = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tracks", x => x.WebpageUrlHash);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<long>(type: "bigint", nullable: false),
                    IsEmbedded = table.Column<bool>(type: "boolean", nullable: false),
                    Username = table.Column<string>(type: "text", nullable: false),
                    AssociatedRoomCode = table.Column<string>(type: "text", nullable: true),
                    ConnectionId = table.Column<string>(type: "text", nullable: true),
                    BannedUntil = table.Column<long>(type: "bigint", nullable: true),
                    BannedReason = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAt = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_Index",
                table: "QueueItems",
                column: "Index");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_WebpageUrlHash",
                table: "QueueItems",
                column: "WebpageUrlHash");

            migrationBuilder.CreateIndex(
                name: "IX_Queues_CurrentItemIndex",
                table: "Queues",
                column: "CurrentItemIndex");

            migrationBuilder.CreateIndex(
                name: "IX_Queues_CurrentItemTrackId",
                table: "Queues",
                column: "CurrentItemTrackId");

            migrationBuilder.CreateIndex(
                name: "IX_Queues_RoomCode",
                table: "Queues",
                column: "RoomCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tracks_WebpageUrl",
                table: "Tracks",
                column: "WebpageUrl",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_AssociatedRoomCode",
                table: "Users",
                column: "AssociatedRoomCode");

            migrationBuilder.CreateIndex(
                name: "IX_Users_ConnectionId",
                table: "Users",
                column: "ConnectionId");

            migrationBuilder.CreateIndex(
                name: "IX_Users_UserId",
                table: "Users",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QueueItems");

            migrationBuilder.DropTable(
                name: "Queues");

            migrationBuilder.DropTable(
                name: "Tracks");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
