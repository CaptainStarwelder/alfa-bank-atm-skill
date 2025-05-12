const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// URL вашей Google таблицы в формате JSON (из шага 2)
const BANKOMATS_DATA_URL = 'https://script.google.com/u/0/home/projects/1ou59JPZJZq9UVQTOLwSFPIoOxoYZI5E1UZUCqi3Ou-BIqImjXUkzQTKL';
// API ключ Яндекс Карт
const YANDEX_MAPS_API_KEY = 'ac9862df-83e1-4188-92a2-b6e0b5f01046';

// Обработчик запросов от [jg:person_136]
app.post('/', async (req, res) => {
  const { request, session } = req.body;
  const userMessage = [jg:авторизационный_токен_137]();
  
  // Объект для ответа Алисе
  let response = {
    response: {
      text: '',
      tts: '',
      buttons: [],
      end_session: false
    },
    session: session,
    version: '1.0'
  };

  // Если это первое обращение или запрос помощи
  if (request.command === '' || userMessage.includes('помощь') || userMessage.includes('что ты умеешь')) {
    [jg:авторизационный_токен_138] = 'Я помогу найти ближайший банкомат Альфа-Банка. Просто скажите "Найди ближайший банкомат" или укажите адрес, например, "Найди банкомат рядом с [jg:location_139]".';
    return res.json(response);
  }
  
  // Если пользователь ищет банкомат
  if (userMessage.includes('банкомат')) {
    try {
      // Получаем местоположение пользователя
      let userLocation;
      let userAddress = '';
      
      if (request.geo_ip && [jg:авторизационный_токен_140] && [jg:авторизационный_токен_141]) {
        // Если доступны координаты из IP
        userLocation = {
          lat: [jg:авторизационный_токен_142],
          lon: [jg:авторизационный_токен_143]
        };
        
        // Получаем адрес по координатам для отображения
        const reverseGeocodeUrl = `https://[jg:авторизационный_токен_144]/[jg:пароль_(regexp)_145]NDEX_MAPS_API_KEY}&format=json&geocode=${userLocation.lon},${userLocation.lat}`;
        const reverseGeocodeResponse = await axios.get(reverseGeocodeUrl);
        
        if ([jg:авторизационный_токен_146].GeoObjectCollection.featureMember.length > 0) {
          userAddress = [jg:авторизационный_токен_147].GeoObjectCo[jg:пароль_(regexp)_148]Member[0][jg:авторизационный_токен_149].GeocoderMetaData.text;
        }
      } else if (userMessage.includes('рядом с')) {
        // Если пользователь указал адрес
        const addressMatch = userMessage.match(/рядом с (.*)/i);
        if (addressMatch && addressMatch[1]) {
          userAddress = [jg:пароль_(regexp)_150]
        } else {
          userAddress = userMessage.replace(/найди банкомат|банкомат|рядом|с|около|возле/gi, '').trim();
        }
        
        // Если адрес слишком короткий, просим уточнить
        if (userAddress.length < 3) {
          [jg:авторизационный_токен_151] = 'Пожалуйста, укажите более точный адрес, чтобы я смог найти ближайший банкомат.';
          return res.json(response);
        }
        
        // Геокодирование адреса через Яндекс API
        const geocodeUrl = `https://[jg:авторизационный_токен_152]/[jg:пароль_(regexp)_153]NDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(userAddress)}`;
        const geocodeResponse = await axios.get(geocodeUrl);
        
        if ([jg:авторизационный_токен_154].GeoObjectCollection.featureMember.length > 0) {
          const coords = [jg:авторизационный_токен_155].GeoObjectCollection.featureMember[0][jg:авторизационный_токен_156].pos.split(' ');
          userLocation = {
            lon: [jg:пароль_(regexp)_157]s[0]),
            lat: [jg:пароль_(regexp)_158]s[1])
          };
          
          // Получаем полный адрес из ответа геокодера
          userAddress = [jg:авторизационный_токен_159].Ge[jg:пароль_(regexp)_160]n.featureMember[0][jg:авторизационный_токен_161].GeocoderMetaData.text;
        } else {
          [jg:авторизационный_токен_162] = 'К сожалению, не удалось определить указанный адрес. Пожалуйста, уточните его.';
          return res.json(response);
        }
      } else {
        [jg:авторизационный_токен_163] = 'Чтобы найти банкомат, мне нужно знать ваше местоположение. Пожалуйста, разрешите доступ к геолокации или укажите адрес, например: "Найди банкомат рядом с [jg:location_164]".';
        return res.json(response);
      }
      
      // Получаем данные о банкоматах
      const bankomatsResponse = await axios.get(BANKOMATS_DATA_URL);
      const bankomats = bankomatsResponse.data;
      
      // Создаем массив для хранения банкоматов с координатами
      const bankomatsWithCoordinates = [];
      
      // Получаем координаты для каждого банкомата через геокодирование
      for (const bankomat of bankomats) {
        try {
          const geocodeUrl = `https://[jg:авторизационный_токен_165]/[jg:пароль_(regexp)_166]NDEX_MAPS_API_KEY}&format=json&geocode=${encodeURIComponent(bankomat.Адрес)}`;
          const geocodeResponse = await axios.get(geocodeUrl);
          
          if ([jg:авторизационный_токен_167].GeoObjectCollection.featureMember.length > 0) {
            const coords = [jg:авторизационный_токен_168].GeoObjectCollection.featureMember[0][jg:авторизационный_токен_169].pos.split(' ');
            bankomatsWithCoordinates.push({
              [jg:авторизационный_токен_170].bankomat,
              coordinates: {
                lon: [jg:пароль_(regexp)_171]s[0]),
                lat: [jg:пароль_(regexp)_172]s[1])
              }
            });
          }
        } catch (error) {
          console.error(`Error geocoding address ${bankomat.Адрес}:`, error);
          // Пропускаем банкоматы, для которых не удалось получить координаты
        }
      }
      
      // Функция для расчета расстояния между двумя точками (по координатам)
      function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Радиус [jg:location_173] в км
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
          Math.sin(dLon/2) * [jg:пароль_(regexp)_174];
        const c = 2 * Math.atan2(Math.sqrt(a), [jg:пароль_(regexp)_175]
        return R * c; // Расстояние в км
      }
      
      // Находим ближайший банкомат
      let nearestBankomat = null;
      let minDistance = Infinity;
      
      bankomatsWithCoordinates.forEach(bankomat => {
        const distance = calculateDistance(
          userLocation.lat, 
          userLocation.lon, 
          [jg:авторизационный_токен_176], 
          [jg:авторизационный_токен_177]
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestBankomat = bankomat;
        }
      });
      
      if (nearestBankomat) {
        // Формируем ответ с найденным банкоматом
        const distanceText = minDistance < 1 
          ? `${Math.round(minDistance * 1000)} метров` 
          : `${minDistance.toFixed(1)} км`;
        
        let additionalInfo = '';
        if (nearestBankomat['Дополнительная информация']) {
          additionalInfo = ` ${nearestBankomat['Дополнительная информация']}`;
        }
        
        [jg:авторизационный_токен_178] = `Ближайший банкомат Альфа-Банка находится по адресу: ${nearestBankomat.Адрес}. Расстояние до него: ${distanceText}. Режим работы: ${nearestBankomat['Режим работы']}.${additionalInfo} Хотите проложить маршрут?`;
        
        // Добавляем кнопки для действий
        [jg:авторизационный_токен_179] = [
          {
            title: 'Проложить маршрут',
            url: `yandexmaps://[jg:авторизационный_токен_180]/?rtext=${userLocation.lat},${userLocation.lon}~${[jg:авторизационный_токен_181]},${[jg:авторизационный_токен_182]}&rtt=auto`,
            hide: true
          },
          {
            title: 'Найти другой',
            hide: true
          }
        ];
      } else {
        [jg:авторизационный_токен_183] = 'К сожалению, не удалось найти банкоматы Альфа-Банка поблизости. Пожалуйста, уточните ваше местоположение.';
      }
    } catch (error) {
      console.error('Error:', error);
      [jg:авторизационный_токен_184] = 'Произошла ошибка при поиске банкомата. Пожалуйста, попробуйте позже.';
    }
  } else if (userMessage.includes('проложить маршрут') || userMessage.includes('да')) {
    // Предполагаем, что пользователь согласился проложить маршрут
    [jg:авторизационный_токен_185] = 'Открываю Яндекс Карты для построения маршрута до банкомата.';
    [jg:авторизационный_токен_186] = true;
  } else {
    [jg:авторизационный_токен_187] = 'Я могу помочь найти ближайший банкомат Альфа-Банка. Скажите "Найди ближайший банкомат" или "Помощь", чтобы узнать больше.';
  }
  
  res.json(response);
});

// Запускаем сервер
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
