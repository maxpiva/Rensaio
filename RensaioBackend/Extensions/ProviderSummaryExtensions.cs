using System;
using RensaioBackend.Models;
using RensaioBackend.Models.Dto;

namespace RensaioBackend.Extensions;

public static class ProviderSummaryExtensions
{
    public static SmallProviderDto ToSmallProviderDto(this ProviderSummaryBase provider)
    {
        ArgumentNullException.ThrowIfNull(provider);

        return new SmallProviderDto
        {
            Provider = provider.Provider,
            Scanlator = provider.Scanlator,
            Language = provider.Language,
            IsStorage = provider.IsStorage,
            ThumbnailUrl = provider.ThumbnailUrl,
            Status = provider.Status,
            Url = provider.Url
        };
    }
}
