using KaizokuBackend.Data;
using KaizokuBackend.Models.Dto.Auth;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Auth
{
    public class UserInviteService
    {
        private readonly UserService _userService;
        private readonly AppDbContext _db;
        private readonly ILogger<UserInviteService> _logger;

        public UserInviteService(UserService userService, AppDbContext db, ILogger<UserInviteService> logger)
        {
            _userService = userService;
            _db = db;
            _logger = logger;
        }

        public async Task<GenerateInviteResponseDto> CreateInviteAsync(Guid userId, CancellationToken token = default)
        {
            var (rawToken, expiresAt) = await _userService.GenerateInviteTokenAsync(userId, token).ConfigureAwait(false);

            var domainSetting = await _db.Settings
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Name == "ExternalDomain", token)
                .ConfigureAwait(false);

            var domain = (domainSetting?.Value ?? string.Empty).Trim();
            string url;
            if (domain.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || domain.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                url = $"{domain.TrimEnd('/')}/set-password?token={rawToken}";
            else
                url = $"/set-password?token={rawToken}";

            var message = $"You've been invited to Kaizoku. Set your password here: {url} (expires {expiresAt:u}).";

            return new GenerateInviteResponseDto
            {
                Token = rawToken,
                Url = url,
                ExpiresAt = expiresAt,
                Message = message
            };
        }
    }
}
