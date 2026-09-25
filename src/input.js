export class InputManager {
  constructor() {
    this.keys = {
      KeyW: false, KeyA: false, KeyS: false, KeyD: false,
      ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
    };
    this.direction = { x: 0, z: 0 };
    this.isActive = false;
    this.isStopped = false;
    
    this.lastKeysPressed = 0;
    this.releaseTimeout = null;
    this.pendingDirX = 0;
    this.pendingDirZ = 0;

    window.addEventListener('keydown', this.onKeyDown.bind(this));
    window.addEventListener('keyup', this.onKeyUp.bind(this));
    window.addEventListener('blur', this.onBlur.bind(this));
  }

  onKeyDown(e) {
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.reset();
      const display = document.getElementById('input-display');
      if (display) display.textContent = `(0.00, 0.00) 정지됨`;
      return;
    }

    if (!Object.hasOwn(this.keys, e.code)) return;
    if (e.repeat && this.isStopped) return;
    if (this.keys.hasOwnProperty(e.code)) {
      this.keys[e.code] = true;
      if(e.code.startsWith('Arrow')) e.preventDefault();
    }
    this.updateDirection();
  }

  onKeyUp(e) {
    if (!Object.hasOwn(this.keys, e.code)) return;
    if (this.keys.hasOwnProperty(e.code)) {
      this.keys[e.code] = false;
    }
    this.updateDirection();
  }

  reset() {
    if (this.releaseTimeout !== null) clearTimeout(this.releaseTimeout);
    this.releaseTimeout = null;
    for (const key in this.keys) this.keys[key] = false;
    this.direction.x = 0;
    this.direction.z = 0;
    this.pendingDirX = 0;
    this.pendingDirZ = 0;
    this.lastKeysPressed = 0;
    this.isActive = false;
    this.isStopped = true;
    const display = document.getElementById('input-display');
    if (display) display.textContent = '(0.00, 0.00) 정지됨';
  }

  onBlur() {
    this.reset();
  }

  updateDirection() {
    let dx = 0;
    let dz = 0;
    let keysPressed = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) { dz -= 1; keysPressed++; }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) { dz += 1; keysPressed++; }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) { dx -= 1; keysPressed++; }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) { dx += 1; keysPressed++; }

    const length = Math.sqrt(dx * dx + dz * dz);
    
    if (length > 0) {
      this.isStopped = false;
      const newDirX = dx / length;
      const newDirZ = dz / length;

      if (keysPressed < this.lastKeysPressed) {
          // Key was released. Delay applying the new (fewer keys) direction 
          // to prevent diagonal "tearing" when releasing multiple keys.
          this.pendingDirX = newDirX;
          this.pendingDirZ = newDirZ;
          
          if (this.releaseTimeout) clearTimeout(this.releaseTimeout);
          this.releaseTimeout = setTimeout(() => {
              this.direction.x = this.pendingDirX;
              this.direction.z = this.pendingDirZ;
              const display = document.getElementById('input-display');
              if (display) display.textContent = `(${this.direction.x.toFixed(2)}, ${this.direction.z.toFixed(2)})`;
              this.releaseTimeout = null;
          }, 80);
      } else {
          // Key was added or swapped
          if (this.releaseTimeout) {
              clearTimeout(this.releaseTimeout);
              this.releaseTimeout = null;
          }
          this.direction.x = newDirX;
          this.direction.z = newDirZ;
      }
      this.isActive = true;
    } else {
      // All keys released
      if (this.releaseTimeout) {
          clearTimeout(this.releaseTimeout);
          this.releaseTimeout = null;
      }
      this.isActive = false;
    }
    
    this.lastKeysPressed = keysPressed;
    
    if (!this.releaseTimeout) {
       const display = document.getElementById('input-display');
       if (display) {
           if (this.isStopped) display.textContent = `(0.00, 0.00) 정지됨`;
           else display.textContent = `(${this.direction.x.toFixed(2)}, ${this.direction.z.toFixed(2)})`;
       }
    }
  }
}
