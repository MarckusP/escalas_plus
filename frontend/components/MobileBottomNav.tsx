import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { LucideIcon } from 'lucide-react';
import { isNavItemActive } from '../utils/nav';

export type NavItem = { label: string; path: string; icon: LucideIcon };

export default function MobileBottomNav({ menu }: { menu: NavItem[] }) {
  const router = useRouter();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100040] bg-gray-900/95 border-t border-gray-700 backdrop-blur safe-area-pb">
      <div
        className="flex gap-1 overflow-x-auto overflow-y-hidden px-2 py-2 scrollbar-thin"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {menu.map(item => {
          const Icon = item.icon;
          const active = isNavItemActive(router.pathname, item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`flex flex-col items-center justify-center min-w-[72px] max-w-[88px] flex-shrink-0 px-2 py-1.5 rounded-xl transition-colors ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium mt-0.5 truncate w-full text-center">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
