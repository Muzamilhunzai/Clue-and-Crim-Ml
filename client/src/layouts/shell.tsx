import { createContext, useContext } from 'react';

/** Lets any page's top band open the mobile navigation drawer. */
export const ShellContext = createContext<{ openNav: () => void }>({ openNav: () => {} });
export const useShell = () => useContext(ShellContext);
