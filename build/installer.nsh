; Extra pages for the BuildSuite Takeoff Studio installer (included by electron-builder).

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to BuildSuite Takeoff Studio"
  !define MUI_WELCOMEPAGE_TEXT "Setup will install BuildSuite Takeoff Studio, the drawing measurement, markup and quantity takeoff program from the BuildSuite family.$\r$\n$\r$\nOn the next page you will be asked to review and accept the BuildSuite Takeoff Studio Terms of Service.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
