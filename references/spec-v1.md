# Спецификация v1

## Общая структура

```json
{
  "version": 1,
  "templateId": "F1",
  "locale": "ru",
  "palette": "mono",
  "content": {
    "title": "Выручка по тарифам",
    "subtitle": "Первое полугодие",
    "source": "Внутренняя отчётность"
  },
  "payload": {
    "categories": ["Базовый", "Команда", "Бизнес"],
    "series": [{"name": "Выручка", "values": [12, 24, 31]}]
  }
}
```

Разрешены только перечисленные поля. `locale` всегда равен `ru`. Палитра — одна из `mono`, `palm`, `porcelain`, `wire` либо объект `{"name":"custom","colors":["#RRGGBB", ...]}`.

## Профили данных

Профиль определяется выбранным ID и проверяется компилятором.

- `series`: `categories` и одна или несколько `series`; длины массивов совпадают.
- `points`: `points` из объектов `{name, x, y, value?}`.
- `matrix`: объект `matrix` с `x`, `y` и плоским массивом `values` из `{x, y, value}`.
- `network`: `nodes` из `{id, name, value?}` и `links` из `{source, target, value?}`; ссылки должны указывать на существующие ID.
- `boxplot`: `categories` и `boxes` из пяти чисел `[min, q1, median, q3, max]`.
- `parallel`: `dimensions` и `rows` из `{name, values}`.
- `ohlc`: `ohlc` из `{date, open, close, low, high}`.
- `calendar`: `calendar` из `{date, value}` с датой `YYYY-MM-DD`.
- `river`: `river` из `{date, name, value}`.
- `map`: `regions` из `{name, value}`.
- `report`: необязательные `kpis`, `sections`, `categories` и `series`.

Строки не могут содержать HTML, URL, `javascript:`, обработчики событий или управляющие символы. Числа должны быть конечными и находиться в диапазоне ±10¹⁵. Ограничения размеров перечислены в JSON Schema и продублированы в исполняемом валидаторе.
