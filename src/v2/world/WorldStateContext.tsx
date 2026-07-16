import { createContext, useContext, useState, type ReactNode } from 'react';

/* 단일 WorldState — v0.4 기획서 핵심 원칙.
   시각·날씨를 여기 한 곳에서만 관리하고 1·2·3단계가 전부 이 값을 상속받는다.
   단계를 이동해도 세계(시간·날씨)가 끊기지 않아야 "세계-우선" 개념이 성립. */

export type Weather = 'clear' | 'rain' | 'snow';

type WorldState = {
  /** 시뮬레이션 시각 (0~24, 소수 허용) */
  hour: number;
  setHour: (h: number) => void;
  /** 현재 날씨 (v0 mock — 추후 기상청 API) */
  weather: Weather;
  setWeather: (w: Weather) => void;
};

const Ctx = createContext<WorldState | null>(null);

export function WorldStateProvider({ children }: { children: ReactNode }) {
  const now = new Date();
  const [hour, setHour] = useState(now.getHours() + now.getMinutes() / 60);
  const [weather, setWeather] = useState<Weather>('clear');
  return (
    <Ctx.Provider value={{ hour, setHour, weather, setWeather }}>{children}</Ctx.Provider>
  );
}

export function useWorldState(): WorldState {
  const v = useContext(Ctx);
  if (!v) throw new Error('WorldStateProvider로 감싸야 합니다');
  return v;
}
