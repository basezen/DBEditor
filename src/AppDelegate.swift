//  AppDelegate.swift
//  DBEditor
//
//  Created by Daniel Bromberg on 8/6/17.
//  Copyright © 2017 Daniel Bromberg. All rights reserved.

import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    let schema = Schema()
    var window: UIWindow? = {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = NavVC(model: schema)
        return w
    }()

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplicationLaunchOptionsKey: Any]?) -> Bool {      
        window?.makeKeyAndVisible()
        return true
    }
}

class Util {
    static var loggingEnabled = true
    static func log(_ msg: String, funcName: String = #function, lineNum: Int = #line, fileName: String = #file) {
        guard loggingEnabled else {
            return
        }
        NSLog("\(fileName):\(lineNum) \(funcName)(): \(msg)")
    }
}

class NavVC: UINavigationController, UINavigationBarDelegate {
    var model: Schema
    
    init(model: Schema) {
        self.model = model
        super.init(nibName: nil, bundle: nil)
    }
    
    required init?(coder aDecoder: NSCoder) {
        return nil
    }
    
    override func viewDidLoad() {
        Util.log("Enter \(type(of: self))")
        view.addSubview(navigationBar)
        let child = TableSelectVC(model: model)
        pushViewController(child, animated: true)
    }
}


class DBTableCell: UITableViewCell {
    
}


class TableSelectVC: UIViewController {
    var model: Schema
    
    init(model: Schema) {
        self.model = model
    }
    
    required init?(coder aDecoder: NSCoder) {
        return nil
        super.init(nibName: nil, bundle: nil)
    }
    
    let tableView = UITableView()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        tableView.register(DBTableCell, forCellReuseIdentifier: TableSelectVC.cellID)
        tableView.delegate = self
        tableView.dataSource = self
    }
}


extension TableSelectVC: UITableViewDataSource {
    static let cellID = "DB Table Cell"
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return model.tables.count
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = self.tableView.dequeueReusableCell(withIdentifier: TableSelectVC.cellID, for: indexPath)
        
    }
}
