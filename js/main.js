import { SlingshotGame } from './game.js';

const canvas = document.getElementById('game-canvas');
const hudTop = document.getElementById('hud-top');
const hudBottom = document.getElementById('hud-bottom');

const elLevel = document.getElementById('hud-level');
const elLevelName = document.getElementById('hud-level-name');
const elTargets = document.getElementById('hud-targets');
const elScore = document.getElementById('hud-score');
const elAmmoQueue = document.getElementById('ammo-queue');
const elAmmoDesc = document.getElementById('ammo-desc');

const elAim = document.getElementById('aim-indicator');
const elPowerFill = document.getElementById('power-bar-fill');
const elPowerVal = document.getElementById('aim-power-val');
const elYawVal = document.getElementById('aim-yaw-val');
const elPitchVal = document.getElementById('aim-pitch-val');

const elAbilityBanner = document.getElementById('ability-banner');
const elAbilityText = document.getElementById('ability-text');

const btnCamera = document.getElementById('btn-camera');
const btnRestart = document.getElementById('btn-restart');
const btnMute = document.getElementById('btn-mute');
const muteIcon = document.getElementById('mute-icon');
const btnNextShot = document.getElementById('btn-next-shot');

const screenStart = document.getElementById('screen-start');
const screenVictory = document.getElementById('screen-victory');
const screenGameOver = document.getElementById('screen-gameover');

let selectedStartLevel = 0;

function showHUD(visible) {
  hudTop.classList.toggle('hidden', !visible);
  hudBottom.classList.toggle('hidden', !visible);
}

function hideModals() {
  screenStart.classList.add('hidden');
  screenVictory.classList.add('hidden');
  screenGameOver.classList.add('hidden');
}

const uiCallbacks = {
  updateHUD({ levelNumber, totalLevels, levelName, remainingTargets, score, shotQueue, projectileDefs }) {
    elLevel.textContent = `${levelNumber} / ${totalLevels}`;
    elLevelName.textContent = levelName;
    elTargets.textContent = String(remainingTargets);
    elScore.textContent = score.toLocaleString();

    elAmmoQueue.innerHTML = '';
    if (shotQueue.length > 0) {
      elAmmoDesc.textContent = projectileDefs[shotQueue[0]].desc;
      shotQueue.forEach((key, idx) => {
        const slot = document.createElement('div');
        slot.className = `ammo-slot ${key}${idx === 0 ? ' active' : ''}`;
        slot.textContent = projectileDefs[key].short;
        slot.title = projectileDefs[key].name;
        elAmmoQueue.appendChild(slot);
      });
    } else {
      elAmmoDesc.textContent = 'No shots remaining';
    }
  },

  showAim() {
    elAim.classList.remove('hidden');
  },

  updateAim(powerPct, yawDeg, pitchDeg) {
    elPowerFill.style.width = `${powerPct}%`;
    elPowerVal.textContent = `${powerPct}%`;
    elYawVal.textContent = `${yawDeg > 0 ? '+' : ''}${yawDeg}°`;
    elPitchVal.textContent = `${pitchDeg}°`;
  },

  hideAim() {
    elAim.classList.add('hidden');
  },

  showAbility(message) {
    elAbilityText.textContent = message;
    elAbilityBanner.classList.remove('hidden');
  },

  hideAbility() {
    elAbilityBanner.classList.add('hidden');
  },

  setNextShotVisible(visible) {
    btnNextShot.classList.toggle('hidden', !visible);
  },

  updateCameraButton(isInspect) {
    btnCamera.classList.toggle('active', isInspect);
    const label = btnCamera.querySelector('.btn-text');
    if (label) label.textContent = isInspect ? 'Slingshot' : 'Inspect';
  },

  showVictory({ levelName, baseScore, unusedBonus, totalScore, stars, hasNextLevel }) {
    hideModals();
    document.getElementById('victory-badge').textContent = hasNextLevel ? 'LEVEL CLEARED!' : 'ALL FORTRESSES CONQUERED!';
    document.getElementById('victory-title').textContent = `${levelName} Cleared`;
    document.getElementById('bd-base').textContent = baseScore.toLocaleString();
    document.getElementById('bd-bonus').textContent = `+${unusedBonus.toLocaleString()}`;
    document.getElementById('bd-total').textContent = totalScore.toLocaleString();

    const starEls = document.querySelectorAll('#star-row .star');
    starEls.forEach((el, idx) => {
      el.classList.remove('earned');
      if (idx < stars) {
        setTimeout(() => el.classList.add('earned'), 160 * (idx + 1));
      }
    });

    const nextBtn = document.getElementById('btn-next-level');
    nextBtn.textContent = hasNextLevel ? 'Next Level →' : 'Play Again from Level 1';
    screenVictory.classList.remove('hidden');
  },

  showGameOver({ remainingTargets, score }) {
    hideModals();
    document.getElementById('go-remaining').textContent = String(remainingTargets);
    document.getElementById('go-score').textContent = score.toLocaleString();
    screenGameOver.classList.remove('hidden');
  },

  onMuteShortcut() {
    const muted = game.sound.toggleMute();
    muteIcon.textContent = muted ? '🔇' : '🔊';
  }
};

const game = new SlingshotGame(canvas, uiCallbacks);
// Pre-render Level 1 in the background behind the start menu
game.loadLevel(0);
game.gameState = 'MENU';
showHUD(false);

// Level selection chips on Start screen
document.querySelectorAll('.level-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.level-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedStartLevel = Number(chip.dataset.level);
    game.loadLevel(selectedStartLevel);
    game.gameState = 'MENU';
  });
});

document.getElementById('btn-play').addEventListener('click', () => {
  game.sound.ensureContext();
  hideModals();
  showHUD(true);
  game.loadLevel(selectedStartLevel);
});

btnCamera.addEventListener('click', () => game.toggleCameraView());
btnRestart.addEventListener('click', () => {
  hideModals();
  game.loadLevel(game.currentLevelIndex);
});
btnMute.addEventListener('click', () => uiCallbacks.onMuteShortcut());
btnNextShot.addEventListener('click', () => game.advanceToNextShot());

document.getElementById('btn-victory-replay').addEventListener('click', () => {
  hideModals();
  game.loadLevel(game.currentLevelIndex);
});

document.getElementById('btn-next-level').addEventListener('click', () => {
  hideModals();
  const nextIndex = (game.currentLevelIndex + 1) % 3;
  game.loadLevel(nextIndex);
});

document.getElementById('btn-go-retry').addEventListener('click', () => {
  hideModals();
  game.loadLevel(game.currentLevelIndex);
});

document.getElementById('btn-go-menu').addEventListener('click', () => {
  hideModals();
  showHUD(false);
  game.gameState = 'MENU';
  screenStart.classList.remove('hidden');
});
