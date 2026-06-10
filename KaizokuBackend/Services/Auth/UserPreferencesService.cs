using KaizokuBackend.Data;
using KaizokuBackend.Models.Database;
using KaizokuBackend.Models.Dto.Auth;
using Microsoft.EntityFrameworkCore;

namespace KaizokuBackend.Services.Auth
{
    public class UserPreferencesService
    {
        private readonly AppDbContext _db;
        private readonly ILogger<UserPreferencesService> _logger;

        public UserPreferencesService(AppDbContext db, ILogger<UserPreferencesService> logger)
        {
            _db = db;
            _logger = logger;
        }

        public async Task<UserPreferencesDto> GetAsync(Guid userId, CancellationToken token = default)
        {
            var prefs = await _db.UserPreferences
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId, token)
                .ConfigureAwait(false);

            if (prefs == null)
            {
                // Create default preferences
                prefs = new UserPreferencesEntity { UserId = userId };
                _db.UserPreferences.Add(prefs);
                await _db.SaveChangesAsync(token).ConfigureAwait(false);
            }

            return MapToDto(prefs);
        }

        public async Task<UserPreferencesDto> UpdateAsync(Guid userId, UpdatePreferencesDto dto, CancellationToken token = default)
        {
            var prefs = await _db.UserPreferences
                .FirstOrDefaultAsync(p => p.UserId == userId, token)
                .ConfigureAwait(false);

            if (prefs == null)
            {
                prefs = new UserPreferencesEntity { UserId = userId };
                _db.UserPreferences.Add(prefs);
            }

            // Partial update: omitted properties keep their stored (or default) values.
            if (dto.Theme != null) prefs.Theme = dto.Theme;
            if (dto.DefaultLanguage != null) prefs.DefaultLanguage = dto.DefaultLanguage;
            if (dto.CardSize != null) prefs.CardSize = dto.CardSize;
            if (dto.NsfwVisibility != null) prefs.NsfwVisibility = dto.NsfwVisibility.Value;

            await _db.SaveChangesAsync(token).ConfigureAwait(false);
            return MapToDto(prefs);
        }

        private static UserPreferencesDto MapToDto(UserPreferencesEntity entity)
        {
            return new UserPreferencesDto
            {
                Theme = entity.Theme,
                DefaultLanguage = entity.DefaultLanguage,
                CardSize = entity.CardSize,
                NsfwVisibility = entity.NsfwVisibility
            };
        }
    }
}
