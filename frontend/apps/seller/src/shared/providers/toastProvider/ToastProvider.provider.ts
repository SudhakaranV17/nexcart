import { toast } from "react-hot-toast";

class ToastService {
  status: Record<string, { isDisplayed: boolean }> = {
    SESSION_EXPIRY: {
      isDisplayed: false,
    },
  };
  private static instance: ToastService;
  private constructor() {}

  public static getInstance(): ToastService {
    if (!ToastService.instance) {
      ToastService.instance = new ToastService();
    }
    return ToastService.instance;
  }

  successToast(message: string, key?: string) {
    if (key && !this.status[key].isDisplayed) {
      toast.success(message, {
        duration: 2000,
      });
      this.status[key].isDisplayed = true;
      this.displayedTimeOut(key);
    }
  }

  errorToast(message: string, key?: string) {
    if (key && !this.status[key].isDisplayed) {
      toast.error(message, {
        duration: 2000,
      });
      this.status[key].isDisplayed = true;
      this.displayedTimeOut(key);
    }
    // } else {
    //   toast.error(message, {
    //     duration: 2000,
    //   });
    // }
  }

  displayedTimeOut(key: string) {
    setTimeout(() => {
      this.status[key].isDisplayed = false;
    }, 5 * 1000);
  }
}

export const toastService = ToastService.getInstance();
