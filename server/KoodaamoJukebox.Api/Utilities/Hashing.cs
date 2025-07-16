using System.Security.Cryptography;
using System.Text;

namespace KoodaamoJukebox.Api.Utilities
{
    public static class Hashing
    {
        public static string ComputeSha256Hash(string input)
        {
            var bytes = Encoding.UTF8.GetBytes(input);
            var hashBytes = SHA256.HashData(bytes);
            return Convert.ToHexStringLower(hashBytes);
        }
    }
}
