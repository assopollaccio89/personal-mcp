const METEO_URL = "https://api.open-meteo.com/v1";
const GEO_URL = "https://geocoding-api.open-meteo.com/v1";

export class WeatherApiClient {
  /**
   * Geocoding: city name to lat/lon
   */
  async geocode(city: string) {
    const url = new URL(`${GEO_URL}/search`);
    url.searchParams.set("name", city);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "it");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Geocoding failed: ${response.statusText}`);
    
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      throw new Error(`Città "${city}" non trovata.`);
    }
    
    return data.results[0]; // { latitude, longitude, name, country }
  }

  /**
   * Current weather + daily forecast
   */
  async getForecast(lat: number, lon: number, days: number = 3) {
    const url = new URL(`${METEO_URL}/forecast`);
    url.searchParams.set("latitude", lat.toString());
    url.searchParams.set("longitude", lon.toString());
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", days.toString());

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Weather API failed: ${response.statusText}`);
    
    return await response.json();
  }
}
