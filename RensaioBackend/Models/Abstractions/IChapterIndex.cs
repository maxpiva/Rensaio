namespace RensaioBackend.Models.Abstractions;

public interface IChapterIndex
{
    public decimal? ChapterNumber { get; set; }
    public int Index { get; set; }
}