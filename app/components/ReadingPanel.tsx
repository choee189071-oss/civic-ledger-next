type Props = {
  item: any;
};

export function ReadingPanel({ item }: Props) {
  return (
    <div className="card">
      <h3>{item?.title || 'Reading'}</h3>
      <div className="stack" style={{ marginTop: 16 }}>
        {(item?.body || ['Select a result and open reading mode.']).map(
          (paragraph: string) => (
            <p key={paragraph} className="muted">{paragraph}</p>
          )
        )}
      </div>
    </div>
  );
}
