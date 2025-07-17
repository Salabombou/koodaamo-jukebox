using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace KoodaamoJukebox.Database.Migrations
{
    /// <inheritdoc />
    public partial class UserBanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BannedReason",
                table: "Users",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "BannedUntil",
                table: "Users",
                type: "bigint",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BannedReason",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "BannedUntil",
                table: "Users");
        }
    }
}
