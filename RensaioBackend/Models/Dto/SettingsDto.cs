using System.Text.Json.Serialization;
using RensaioBackend.Extensions;

namespace RensaioBackend.Models.Dto;

public class SettingsDto : EditableSettingsDto
{
    private string _storageFolder = string.Empty;

    [JsonPropertyName("storageFolder")]
    public string StorageFolder
    {
        get => _storageFolder.SanitizeDirectory();
        set => _storageFolder = value;
    }

}