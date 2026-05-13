import { config } from '../config.js';

interface WeatherData {
  city: string;
  temp: number;
  condition: string;
  humidity: number;
  wind: string;
}

export const weatherService = {
  async getCurrent(): Promise<WeatherData> {
    if (!config.HEFENG_API_KEY) {
      return { city: config.HEFENG_CITY, temp: 20, condition: '未知', humidity: 50, wind: '微风' };
    }

    try {
      const cityEncoded = encodeURIComponent(config.HEFENG_CITY);
      const url = `https://devapi.qweather.com/v7/weather/now?location=${cityEncoded}&key=${config.HEFENG_API_KEY}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json = await resp.json() as { now?: { temp: string; text: string; humidity: string; windDir: string } };
      if (json.now) {
        return {
          city: config.HEFENG_CITY,
          temp: parseInt(json.now.temp),
          condition: json.now.text,
          humidity: parseInt(json.now.humidity),
          wind: json.now.windDir,
        };
      }
    } catch { /* fallback */ }

    return { city: config.HEFENG_CITY, temp: 20, condition: '未知', humidity: 50, wind: '微风' };
  },

  formatNatural(data: WeatherData): string {
    return `${data.city} ${data.temp}°C ${data.condition}`;
  },
};
