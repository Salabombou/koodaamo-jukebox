using System.Diagnostics;
using System.Text;

namespace KoodaamoJukebox.Api.Utilities
{
    public static class CurlHelper
    {
        public static async Task<string> GetStringAsync(string url)
        {
            var output = new StringBuilder();
            var error = new StringBuilder();
            using (var process = new Process())
            {
                process.StartInfo.FileName = "curl";
                process.StartInfo.Arguments = $"-sL {url}";
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;

                process.OutputDataReceived += (sender, args) => { if (args.Data != null) output.AppendLine(args.Data); };
                process.ErrorDataReceived += (sender, args) => { if (args.Data != null) error.AppendLine(args.Data); };

                process.Start();
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                {
                    throw new Exception($"curl failed: {error}");
                }
            }
            return output.ToString();
        }

        public static async Task DownloadFileAsync(string url, string destinationPath)
        {
            using (var process = new Process())
            {
                process.StartInfo.FileName = "curl";
                process.StartInfo.Arguments = $"-sL {url} -o {destinationPath}";
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;

                process.Start();
                await process.WaitForExitAsync();

                if (process.ExitCode != 0)
                {
                    var error = await process.StandardError.ReadToEndAsync();
                    throw new Exception($"curl failed: {error}");
                }
            }
        }
    }
}
