import noticeBoard from '../assets/notice_board.png';
import startButton from '../assets/start_button.png';


interface StartScreenProps {
  onStart: () => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1000,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Hanging notice board */}
      <div
        style={{
          position: 'relative',
          width: 'min(90vw, 1100px, 145vh)',
          marginTop: '-20px',
          // Makes cqw relative to THIS board
          containerType: 'inline-size',
        }}
      >
        <img
          src={noticeBoard}
          alt="Notice board"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
            imageRendering: 'crisp-edges',
            filter: 'drop-shadow(0 15px 35px rgba(0,0,0,0.8))',
            pointerEvents: 'none',
          }}
        />

        {/* Text */}
        <div
          style={{
            position: 'absolute',
            top: '32%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '37%',
            textAlign: 'center',
            fontFamily: 'Pixelify Sans',
            color: '#311913',
          }}
      >
          <h1
            style={{
              margin: '0 0 1%',
              fontSize: 'clamp(14px, 3.6cqw, 40px)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Investigator's Notes
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 'clamp(9px, 2cqw, 24px)',
              lineHeight: 1.7,
            }}
          >
            3 People went missing on 17th of september. The AI knows the answer but it has amnesia.
            You have to <strong>Ask the right questions</strong> so that it can help you solve the mystery. 
            <strong> All the Best!!</strong>
          </p>
        </div>
      </div>

      {/* Button stays near bottom */}
      <img
        src={startButton}
        alt="Let's solve this"
        onClick={onStart}
        style={{
          position: 'absolute',
          bottom: '8vh',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '300px', // adjust if needed
          height: 'auto',
          cursor: 'pointer',
          imageRendering: 'pixelated',
          transition: 'transform 0.1s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform =
            'translateX(-50%) scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform =
            'translateX(-50%) scale(1)';
        }}
      />
    </div>
  );
}