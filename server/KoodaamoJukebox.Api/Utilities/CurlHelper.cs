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

        public static async Task DownloadFileAsync(string url, string destinationPath, Microsoft.Extensions.Logging.ILogger? logger = null, string? context = null)
        {
            var sw = Stopwatch.StartNew();
            using (var process = new Process())
            {
                process.StartInfo.FileName = "curl";
                process.StartInfo.Arguments = $"-sL {url} -o {destinationPath}";
                process.StartInfo.RedirectStandardOutput = true;
                process.StartInfo.RedirectStandardError = true;
                process.StartInfo.UseShellExecute = false;
                process.StartInfo.CreateNoWindow = true;

                logger?.LogInformation("CurlHelper: Running curl command: curl -sL {Url} -o {Dest} (context={Context})", url, destinationPath, context);
                process.Start();
                var stdOut = await process.StandardOutput.ReadToEndAsync();
                var stdErr = await process.StandardError.ReadToEndAsync();
                await process.WaitForExitAsync();
                sw.Stop();

                logger?.LogInformation("CurlHelper: curl finished in {ElapsedMs}ms (context={Context})", sw.ElapsedMilliseconds, context);
                if (!string.IsNullOrWhiteSpace(stdOut))
                    logger?.LogInformation("CurlHelper: curl stdout: {StdOut} (context={Context})", stdOut, context);
                if (!string.IsNullOrWhiteSpace(stdErr))
                    logger?.LogWarning("CurlHelper: curl stderr: {StdErr} (context={Context})", stdErr, context);

                if (process.ExitCode != 0)
                {
                    logger?.LogError("CurlHelper: curl failed with exit code {ExitCode} (context={Context})", process.ExitCode, context);
                    throw new Exception($"curl failed: {stdErr}");
                }
            }
        }
    }
}
