import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDELayout } from '../ide-layout';
import { setupTestDatabase, teardownTestDatabase } from '@/lib/test-db';
import type { Database } from 'better-sqlite3';

// 2. Mocks: Use `vi.mock` estritamente local dentro do escopo do arquivo.
vi.mock('@/lib/store', () => {
  return {
    useIDEStore: vi.fn((selector) => {
      const state = {
        openTabs: [],
        activeTabId: null,
        sidebarWidth: 260,
        bottomPanelHeight: 250,
        rightPanelWidth: 380,
        showSidebar: true,
        showBottomPanel: true,
        showRightPanel: true,
        activeSidebarPanel: 'files',
        activeBottomPanel: 'terminal',
        theme: 'dark',
        setSidebarWidth: vi.fn(),
        setBottomPanelHeight: vi.fn(),
        setRightPanelWidth: vi.fn(),
        toggleBottomPanel: vi.fn(),
        setActiveSidebarPanel: vi.fn(),
        setActiveBottomPanel: vi.fn(),
        updateTabContent: vi.fn(),
        files: [],
        messages: [],
        debateSession: null,
        terminalHistory: []
      };
      return selector ? selector(state) : state;
    }),
  };
});

describe('IDE Layout [GF-TEST-001]', () => {
  let db: Database;

  beforeEach(() => {
    // 1. Isolamento de Banco de Dados: SQLite efêmero com VITEST_WORKER_ID
    db = setupTestDatabase();
  });

  afterEach(() => {
    // Limpeza de Banco de Dados
    teardownTestDatabase();
    vi.clearAllMocks();
  });

  it('deve inicializar o banco de dados de teste isolado e efêmero [GF-TEST-002]', () => {
    const insert = db.prepare('INSERT INTO test_users (name) VALUES (?)');
    insert.run('Test Environment');

    const row = db.prepare('SELECT * FROM test_users WHERE name = ?').get('Test Environment') as { id: number, name: string };
    expect(row).toBeDefined();
    expect(row.name).toBe('Test Environment');
  });

  it('deve renderizar os painéis da IDE usando mocks locais isolados [GF-TEST-003]', () => {
    render(<IDELayout />);
    
    // O mock define `activeSidebarPanel` como 'files', portanto o componente FileExplorer vai ser renderizado
    // A ActivityBar mostra "Explorador" e deve estar presente no dom
    expect(screen.getByTitle('Explorador')).toBeInTheDocument();
  });
});
