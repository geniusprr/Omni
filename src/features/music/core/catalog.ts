import { trackKey, type MusicTrack } from './types'

export type MusicTheme =
  | 'sunset'
  | 'cyberpunk'
  | 'forest'
  | 'glass'
  | 'midnight'
  | 'retro'
  | 'lofi'
  | 'aurora'
  | 'emerald'
  | 'crimson'

export type MusicCategory =
  | 'all'
  | 'popular'
  | 'turkish'
  | 'lofi'
  | 'piano'
  | 'synthwave'
  | 'jazz'
  | 'rock'
  | 'electronic'
  | 'ambient'

export type MusicPreset = MusicTrack

export const MUSIC_CATEGORIES: { id: MusicCategory; label: string; icon: string }[] = [
  { id: 'all', label: 'Tümü', icon: '✨' },
  { id: 'popular', label: 'Global Hits', icon: '🔥' },
  { id: 'turkish', label: 'Türkçe Pop & Akustik', icon: '🇹🇷' },
  { id: 'lofi', label: 'Lofi & Chillhop', icon: '☕' },
  { id: 'piano', label: 'Piyano & Odak', icon: '🎹' },
  { id: 'synthwave', label: 'Synthwave & Neon', icon: '⚡' },
  { id: 'jazz', label: 'Caz & Kahve', icon: '🎷' },
  { id: 'rock', label: 'Rock & Indie', icon: '🎸' },
  { id: 'electronic', label: 'Deep House & Elektronik', icon: '🎧' },
  { id: 'ambient', label: 'Doğa & Uyku', icon: '💤' },
]

function youtubePreset(
  providerTrackId: string,
  title: string,
  artist: string,
  artworkUrl: string,
  category: Exclude<MusicCategory, 'all'>,
  durationLabel: string,
): MusicPreset {
  return {
    id: trackKey('youtube', providerTrackId),
    provider: 'youtube',
    providerTrackId,
    title,
    artist,
    artworkUrl,
    externalUrl: `https://www.youtube.com/watch?v=${providerTrackId}`,
    metadata: { category, durationLabel, source: 'shutty-catalog' },
  }
}

export const MUSIC_PRESETS: MusicPreset[] = [
  youtubePreset(
    'jfKfPfyJRdk',
    'Lofi Hip Hop Radio - Beats to Relax/Study',
    'Lofi Girl • 24/7 Canlı Yayın',
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80',
    'lofi',
    'Canlı',
  ),
  youtubePreset(
    'rUxyKA_-grg',
    'Lofi Sleep & Deep Rest',
    'Lofi Girl • Gece Sakinliği',
    'https://images.unsplash.com/photo-1511295742362-92c96b124e52?auto=format&fit=crop&w=600&q=80',
    'lofi',
    'Canlı',
  ),
  youtubePreset(
    '5yx6BWlEVcY',
    'Chillhop Radio - Jazzy & Lofi Beats',
    'Chillhop Music',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
    'lofi',
    'Canlı',
  ),
  youtubePreset(
    '4NRXx6U8ABQ',
    'Blinding Lights',
    'The Weeknd',
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=600&q=80',
    'popular',
    '3:20',
  ),
  youtubePreset(
    '34Na4j8AVgA',
    'Starboy (feat. Daft Punk)',
    'The Weeknd',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=600&q=80',
    'popular',
    '3:50',
  ),
  youtubePreset(
    'H5v3kku4y6Q',
    'As It Was',
    'Harry Styles',
    'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=600&q=80',
    'popular',
    '2:47',
  ),
  youtubePreset(
    '8qFz5q8B3zM',
    'Yalnız Çiçek',
    'Aleyna Tilki ft. Emrah Karaduman',
    'https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=600&q=80',
    'turkish',
    '3:45',
  ),
  youtubePreset(
    'Kz9zLhI7b0w',
    'Dursun Zaman',
    'Manga ft. Göksel',
    'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=600&q=80',
    'turkish',
    '4:20',
  ),
  youtubePreset(
    'Z9p3iA6g_0w',
    'Felaket',
    'Ezhel',
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=600&q=80',
    'turkish',
    '3:30',
  ),
  youtubePreset(
    '4xDzrJKXOOY',
    'Synthwave Radio - Chill Retro Vibes',
    'Lofi Girl • Retrowave & Chill',
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=600&q=80',
    'synthwave',
    'Canlı',
  ),
  youtubePreset(
    'z48G1i4oXU4',
    'Cyberpunk Ambient Engine 2077',
    'Sci-Fi Focus Soundscapes',
    'https://images.unsplash.com/photo-1515260268569-9271009adfdb?auto=format&fit=crop&w=600&q=80',
    'synthwave',
    '3:15:00',
  ),
  youtubePreset(
    'Dx5qFachd3A',
    'Peaceful Piano Focus & Study',
    'Deep Work & Study Melodies',
    'https://images.unsplash.com/photo-1520523839898-50712825e3a7?auto=format&fit=crop&w=600&q=80',
    'piano',
    '3:00:00',
  ),
  youtubePreset(
    'jgpJVI3tDbY',
    'Classical Music for Brain Power',
    'Mozart & Chopin Focus',
    'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=600&q=80',
    'piano',
    '2:40:00',
  ),
  youtubePreset(
    'lP26UCnoH9s',
    'Coffee Shop Bossa & Jazz Lounge',
    'Smooth Ambient Coffee Jazz',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=600&q=80',
    'jazz',
    '3:30:00',
  ),
  youtubePreset(
    '7NOSDKb0HlU',
    'Warm Acoustic Guitar Dreams',
    'Gentle Guitar & Relaxing Breeze',
    'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=600&q=80',
    'rock',
    '2:15:00',
  ),
  youtubePreset(
    'hTWKbfoikeg',
    'Deep House Relax & Focus Radio',
    'The Vibe Guide • Live',
    'https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?auto=format&fit=crop&w=600&q=80',
    'electronic',
    'Canlı',
  ),
  youtubePreset(
    'mPZkdNFkNps',
    'Rain on Window with Cozy Ambient',
    'Calm Sleep Sounds',
    'https://images.unsplash.com/photo-1519692933481-e162a57d6721?auto=format&fit=crop&w=600&q=80',
    'ambient',
    '8:00:00',
  ),
]

export const THEME_CONFIGS: Record<
  MusicTheme,
  { name: string; gradient: string; badgeBg: string; accent: string; glow: string; desc: string }
> = {
  sunset: {
    name: 'Lo-Fi Sunset',
    gradient: 'linear-gradient(180deg, rgba(239, 68, 68, 0.22) 0%, rgba(217, 70, 239, 0.35) 40%, rgba(15, 23, 42, 0.94) 100%)',
    badgeBg: 'rgba(239, 68, 68, 0.25)',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.35)',
    desc: 'Sıcak gün batımı ve lo-fi estetiği',
  },
  cyberpunk: {
    name: 'Neon Cyberpunk',
    gradient: 'linear-gradient(180deg, rgba(6, 182, 212, 0.25) 0%, rgba(168, 85, 247, 0.38) 50%, rgba(10, 10, 24, 0.96) 100%)',
    badgeBg: 'rgba(6, 182, 212, 0.25)',
    accent: '#06b6d4',
    glow: 'rgba(6, 182, 212, 0.45)',
    desc: 'Neon mavi ve mor fütüristik parlama',
  },
  forest: {
    name: 'Deep Forest',
    gradient: 'linear-gradient(180deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.35) 45%, rgba(6, 28, 20, 0.95) 100%)',
    badgeBg: 'rgba(16, 185, 129, 0.25)',
    accent: '#10b981',
    glow: 'rgba(16, 185, 129, 0.35)',
    desc: 'Huzurlu zümrüt ve çam ormanı',
  },
  glass: {
    name: 'Frosted Glass',
    gradient: 'linear-gradient(180deg, rgba(255, 255, 255, 0.2) 0%, rgba(148, 163, 184, 0.18) 40%, rgba(15, 23, 42, 0.9) 100%)',
    badgeBg: 'rgba(255, 255, 255, 0.2)',
    accent: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.25)',
    desc: 'Temiz yarı saydam cam görünümü',
  },
  midnight: {
    name: 'Midnight Sky',
    gradient: 'linear-gradient(180deg, rgba(59, 130, 246, 0.22) 0%, rgba(99, 102, 241, 0.35) 45%, rgba(3, 7, 18, 0.97) 100%)',
    badgeBg: 'rgba(59, 130, 246, 0.25)',
    accent: '#6366f1',
    glow: 'rgba(99, 102, 241, 0.4)',
    desc: 'Gece mavisi ve derin yıldız ışıltısı',
  },
  retro: {
    name: 'Retro Amber',
    gradient: 'linear-gradient(180deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.35) 45%, rgba(26, 14, 2, 0.95) 100%)',
    badgeBg: 'rgba(245, 158, 11, 0.25)',
    accent: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.4)',
    desc: 'Kehribar kaset tonları',
  },
  lofi: {
    name: 'Cozy Anime Room',
    gradient: 'linear-gradient(180deg, rgba(236, 72, 153, 0.22) 0%, rgba(139, 92, 246, 0.3) 45%, rgba(23, 15, 38, 0.95) 100%)',
    badgeBg: 'rgba(236, 72, 153, 0.25)',
    accent: '#ec4899',
    glow: 'rgba(236, 72, 153, 0.4)',
    desc: 'Pastel anime & lo-fi odası',
  },
  aurora: {
    name: 'Nordic Aurora',
    gradient: 'linear-gradient(180deg, rgba(45, 212, 191, 0.25) 0%, rgba(56, 189, 248, 0.35) 45%, rgba(4, 21, 37, 0.96) 100%)',
    badgeBg: 'rgba(45, 212, 191, 0.25)',
    accent: '#2dd4bf',
    glow: 'rgba(45, 212, 191, 0.4)',
    desc: 'Kuzey ışıkları ve ferah turkuaz',
  },
  emerald: {
    name: 'Emerald Matrix',
    gradient: 'linear-gradient(180deg, rgba(34, 197, 94, 0.25) 0%, rgba(16, 185, 129, 0.35) 50%, rgba(2, 28, 14, 0.96) 100%)',
    badgeBg: 'rgba(34, 197, 94, 0.25)',
    accent: '#22c55e',
    glow: 'rgba(34, 197, 94, 0.4)',
    desc: 'Zümrüt yeşili matris ışıltısı',
  },
  crimson: {
    name: 'Crimson Velvet',
    gradient: 'linear-gradient(180deg, rgba(244, 63, 94, 0.28) 0%, rgba(190, 18, 60, 0.38) 45%, rgba(28, 2, 8, 0.96) 100%)',
    badgeBg: 'rgba(244, 63, 94, 0.25)',
    accent: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.45)',
    desc: 'Kadife kırmızı ve sıcak tutku',
  },
}
