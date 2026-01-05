# 🎮 Chat Word Battle (Kick + Twitch)

A **cloud-hosted chat word guessing game** for streamers, supporting **Kick and Twitch simultaneously**, with optional **Kick vs Twitch** scoring.

Designed to work with an **OBS browser overlay** (no local apps, no localhost).

---

## ✨ Features

- 🔤 Random **English-only words** (fetched from the internet)
- 🚫 **Bad-word / profanity filtered** (stream safe)
- 👀 First & last letter revealed
- ⏱️ Random letters reveal over time
- 💬 Chat guessing with `!guess <word>`
- 🆚 Optional **Kick vs Twitch** score battle
- 👑 Owner-only commands
- ☁️ 100% cloud-based (Railway compatible)
- 🎥 OBS Browser Source ready

---

## 🕹️ Chat Commands

### 🎮 Word Game
| Command | Who | Action |
|------|----|------|
| `!word` | Owner only | Start the word game |
| `!endword` | Owner only | Stop the word game |
| `!guess <word>` | Everyone | Guess the word |

### 🆚 Kick vs Twitch Mode
| Command | Who | Action |
|------|----|------|
| `!kvt` | Owner only | Enable Kick vs Twitch scoring |

> ⚠️ `!kvt` **does NOT start the game**  
> It only enables platform scoring once the game is running.

---

## 📁 Project Structure

