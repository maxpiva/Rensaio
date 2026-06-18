using RensaioOAuthProxy.Services;

namespace RensaioOAuthProxy;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Services.AddControllers();

        // Register services
        builder.Services.AddSingleton<TokenStoreService>();
        builder.Services.AddScoped<ProviderApiService>();
        builder.Services.AddHttpClient();

        var app = builder.Build();

        app.UseHttpsRedirection();
        app.MapControllers();

        app.Run();
    }
}
