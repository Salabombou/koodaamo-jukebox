using KoodaamoJukebox.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using System.Collections.Concurrent;
using KoodaamoJukebox.Utilities;

namespace KoodaamoJukebox.Services
{
    public class TrackService
    {
        private readonly AppDbContext _dbContext;

        public TrackService(AppDbContext dbContext)
        {
            _dbContext = dbContext;
        }
    }
}
