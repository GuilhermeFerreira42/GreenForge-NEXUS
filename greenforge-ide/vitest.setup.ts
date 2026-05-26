import '@testing-library/jest-dom'
import { vi } from 'vitest'

// 2. Mocks: Global mocks can be placed here, 
// BUT the rules say: "Use `vi.mock` estritamente local dentro do escopo do arquivo."
// So this file stays minimal and does not include any global vi.mock.
